import { Injectable } from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  resolveCallerReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';

/**
 * Muzlatilgan puli tabi uchun pastki chegara — muzlatilgandan keyin kamida
 * shuncha kun o'tgan bo'lishi kerak. CEO buni sozlanadigan qilishni
 * rad etdi: bitta doimiy son, kod ichida.
 */
const FROZEN_BALANCE_MIN_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface FrozenBalanceRow {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  frozenAt: Date;
  daysFrozen: number;
  lastPaymentAt: Date | null;
}

export interface FrozenBalancesQuery {
  branchId?: number;
  page?: number;
  pageSize?: number;
  userId: number;
  roles: string[];
}

export interface FrozenBalancesResult {
  data: FrozenBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * "Muzlatilgan puli" ish ro'yxati — muzlatilgan o'quvchi, balansi musbat va
 * muzlatilganiga 30 kundan ortiq bo'lgan bo'lsa, shu yerda chiqadi, shunda
 * admin puli qaytarish yoki markaz hisobiga o'tkazish haqida qaror qilishi
 * mumkin.
 *
 * Jonli hisoblanadi — cron yo'q, saqlangan jadval yo'q. Sabab: cron
 * ishlamay qolsa ro'yxat jimgina bo'shab qoladi yoki eskiradi; bitta so'rov
 * har doim bugungi holatni ko'rsatadi.
 *
 * Faqat o'qiydi — hech qanday yozish (create/update/delete) yo'q.
 */
@Injectable()
export class PaymentsFrozenBalanceService {
  constructor(private prisma: PrismaService) {}

  async getFrozenBalances(
    companyId: number,
    query: FrozenBalancesQuery,
  ): Promise<FrozenBalancesResult> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // Filial qamrovi — `/payments/debtors` bilan bir xil naqsh. `null` —
    // butun kompaniya (hech narsa tanlamagan CEO). Bo'sh ro'yxat — HECH
    // NARSA, hech qachon butun kompaniyaga qaytmaydi.
    const branchIds = await resolveCallerReportBranchIds(
      this.prisma,
      query.userId,
      query.branchId,
    );
    if (branchIds != null && branchIds.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }

    const cutoff = new Date(Date.now() - FROZEN_BALANCE_MIN_DAYS * MS_PER_DAY);

    const where = {
      companyId,
      deletedAt: null,
      status: StudentStatus.FROZEN,
      balance: { gt: 0 },
      statusChangedAt: { lt: cutoff },
      ...studentBranchWhere(branchIds),
    };

    const [rows, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          balance: true,
          statusChangedAt: true,
        },
        orderBy: { statusChangedAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.student.count({ where }),
    ]);

    // Oxirgi to'lov sanasi — BITTA guruhlangan so'rov butun sahifa uchun,
    // har bir qator uchun alohida so'rov emas (886 o'quvchi bo'lgan
    // jadvalda N+1 bo'lmasligi shart). Bekor qilingan (REVERSED) to'lovlar
    // "oxirgi to'lov" sifatida hisoblanmaydi.
    const studentIds = rows.map((r) => r.id);
    const lastPayments =
      studentIds.length > 0
        ? await this.prisma.payment.groupBy({
            by: ['studentId'],
            where: {
              studentId: { in: studentIds },
              status: { not: 'REVERSED' },
            },
            _max: { createdAt: true },
          })
        : [];
    const lastPaymentByStudent = new Map<number, Date | null>();
    for (const p of lastPayments) {
      lastPaymentByStudent.set(p.studentId, p._max.createdAt ?? null);
    }

    const now = Date.now();
    const data: FrozenBalanceRow[] = rows.map((r) => {
      const frozenAt = r.statusChangedAt as Date;
      return {
        studentId: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        balance: r.balance,
        frozenAt,
        daysFrozen: Math.floor((now - frozenAt.getTime()) / MS_PER_DAY),
        lastPaymentAt: lastPaymentByStudent.get(r.id) ?? null,
      };
    });

    return { data, total, page, pageSize };
  }
}
