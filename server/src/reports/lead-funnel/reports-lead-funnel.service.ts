import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus, PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type ReportBranchIds,
  studentBranchWhere,
} from '../../common/finance/report-branch-scope';
import { leadAttributionWhere } from '../../leads/shared/lead-scope';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentMonthKey,
  tashkentRangeUtc,
} from '../../common/date/tashkent';
import {
  countStages,
  type FunnelMode,
  type FunnelPerson,
  type FunnelStage,
  personsAtStage,
  type StageSets,
  toPersons,
} from './lead-funnel.math';

export type FunnelPeopleStage = FunnelStage | 'unpaid';

export interface FunnelPeriodInput {
  startDate?: string;
  endDate?: string;
}

export interface FunnelPeopleInput extends FunnelPeriodInput {
  stage: FunnelPeopleStage;
  mode: FunnelMode;
  page: number;
  pageSize: number;
}

export interface FunnelPersonRow {
  key: string;
  name: string;
  phone: string;
  studentId: number | null;
  studentStatus: string | null;
  source: string | null;
  createdAt: Date;
}

const ATTENDED: AttendanceStatus[] = [
  AttendanceStatus.PRESENT,
  AttendanceStatus.LATE,
];

/**
 * Lid voronkasi: to'lovgacha bo'lgan yo'l.
 * Dizayn: docs/superpowers/specs/2026-09-13-lid-voronkasi-design.md
 */
@Injectable()
export class ReportsLeadFunnelService {
  constructor(private prisma: PrismaService) {}

  async getFunnel(
    companyId: number,
    input: FunnelPeriodInput,
    scope: ReportBranchIds,
  ) {
    const period = resolvePeriod(input);
    const { persons, sets } = await this.loadCohort(companyId, period, scope);
    const unpaid = await this.loadUnpaid(companyId, scope, {
      status: true,
    });

    return {
      period,
      ...countStages(persons, sets),
      unpaid: splitByStatus(unpaid),
    };
  }

  async getPeople(
    companyId: number,
    input: FunnelPeopleInput,
    scope: ReportBranchIds,
  ) {
    const { page, pageSize } = input;
    const start = (page - 1) * pageSize;

    if (input.stage === 'unpaid') {
      const all = await this.loadUnpaid(companyId, scope, {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        status: true,
        createdAt: true,
      });
      const data: FunnelPersonRow[] = all
        .slice(start, start + pageSize)
        .map((s) => ({
          key: `s:${s.id}`,
          name: `${s.firstName} ${s.lastName}`.trim(),
          phone: s.phone,
          studentId: s.id,
          studentStatus: s.status,
          source: null,
          createdAt: s.createdAt,
        }));
      return { data, total: all.length, page, pageSize };
    }

    const period = resolvePeriod(input);
    const { persons, sets } = await this.loadCohort(companyId, period, scope);
    const matched = personsAtStage(persons, sets, input.stage, input.mode);
    const slice = matched.slice(start, start + pageSize);

    return {
      data: await this.withStudentStatus(slice),
      total: matched.length,
      page,
      pageSize,
    };
  }

  /**
   * Davrda kelgan odamlar va ular yetgan bosqichlar.
   *
   * `deletedAt` bo'yicha ATAYLAB filtrlanmaydi: yo'qotilgan (arxivlangan) lid
   * voronkadan tushib qolgan odam. Uni chiqarish birinchi blokni kichraytirib,
   * konversiyani yolg'on oshirardi.
   *
   * Filial `leadAttributionWhere` bilan — SANASH predikati. Ko'rinish predikati
   * (`leadBranchWhere`) belgilanmagan lidlarni har bir filialga qo'shardi va
   * filiallar yig'indisi kompaniya jamidan oshib ketardi.
   */
  private async loadCohort(
    companyId: number,
    period: { startDate: string; endDate: string },
    scope: ReportBranchIds,
  ): Promise<{ persons: FunnelPerson[]; sets: StageSets }> {
    const leads = await this.prisma.lead.findMany({
      where: {
        companyId,
        createdAt: tashkentRangeUtc(period.startDate, period.endDate),
        ...leadAttributionWhere(scope),
      },
      select: {
        id: true,
        convertedStudentId: true,
        sectionId: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        source: { select: { name: true } },
      },
    });

    const persons = toPersons(
      leads.map((l) => ({
        id: l.id,
        studentId: l.convertedStudentId,
        board: l.sectionId != null,
        firstName: l.firstName,
        lastName: l.lastName,
        phone: l.phone,
        source: l.source?.name ?? null,
        createdAt: l.createdAt,
      })),
    );

    const studentIds = persons
      .map((p) => p.studentId)
      .filter((id): id is number => typeof id === 'number');

    // Har bosqich oldingisining ichidan qidiriladi — voronka qat'iy ichma-ich,
    // va keyingi so'rov kichikroq ro'yxat bilan ishlaydi.
    //
    // `groupBy`, `findMany({ distinct })` emas: Prisma `distinct` ni xotirada
    // bajaradi, ya'ni uzoq davrda kogortaning HAR davomat qatori yuklanardi.
    // GROUP BY bazada bajariladi va har o'quvchiga bitta qator qaytaradi.
    // Natija alohida o'zgaruvchiga olinadi: Prisma `groupBy` generigi lambda
    // qaytish tipidan kontekst olsa, argument tipini noto'g'ri chiqaradi.
    const enrolled = await this.distinctStudents(studentIds, async (ids) => {
      const rows = await this.prisma.enrollment.groupBy({
        by: ['studentId'],
        where: { studentId: { in: ids } },
      });
      return rows;
    });
    const attended = await this.distinctStudents([...enrolled], async (ids) => {
      const rows = await this.prisma.attendance.groupBy({
        by: ['studentId'],
        where: { companyId, studentId: { in: ids }, status: { in: ATTENDED } },
      });
      return rows;
    });
    const paid = await this.distinctStudents([...attended], async (ids) => {
      const rows = await this.prisma.payment.groupBy({
        by: ['studentId'],
        where: {
          companyId,
          studentId: { in: ids },
          status: PaymentStatus.COMPLETED,
        },
      });
      return rows;
    });

    return { persons, sets: { enrolled, attended, paid } };
  }

  private async distinctStudents(
    ids: number[],
    query: (ids: number[]) => Promise<{ studentId: number }[]>,
  ): Promise<Set<number>> {
    if (ids.length === 0) return new Set();
    const rows = await query(ids);
    return new Set(rows.map((r) => r.studentId));
  }

  /**
   * Darsga kelgan, lekin birorta ham yakunlangan to'lovi yo'q tirik o'quvchilar.
   *
   * Bugungi holat — davr filtriga bog'liq emas. Holat bo'yicha bo'linish
   * chaqiruvchida: prodda bu guruhning yarmidan ko'pi muzlatilgan yoki
   * chetlatilgan, ya'ni bo'linmagan jami «hozir qo'ng'iroq qilinadiganlar»
   * deb noto'g'ri o'qiladi. Ro'yxat yuzlab qator — xotirada sahifalanadi.
   */
  private loadUnpaid<S extends Prisma.StudentSelect>(
    companyId: number,
    scope: ReportBranchIds,
    select: S,
  ) {
    return this.prisma.student.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...studentBranchWhere(scope),
        attendances: { some: { status: { in: ATTENDED } } },
        payments: { none: { status: PaymentStatus.COMPLETED } },
      },
      select,
      orderBy: [{ status: 'asc' }, { lastName: 'asc' }],
    });
  }

  private async withStudentStatus(
    persons: FunnelPerson[],
  ): Promise<FunnelPersonRow[]> {
    const ids = persons
      .map((p) => p.studentId)
      .filter((id): id is number => typeof id === 'number');
    const statuses = ids.length
      ? await this.prisma.student.findMany({
          where: { id: { in: ids } },
          select: { id: true, status: true },
        })
      : [];
    const byId = new Map(statuses.map((s) => [s.id, s.status as string]));

    return persons.map((p) => ({
      key: p.key,
      name: p.name,
      phone: p.phone,
      studentId: p.studentId,
      studentStatus:
        p.studentId != null ? (byId.get(p.studentId) ?? null) : null,
      source: p.source,
      createdAt: p.createdAt,
    }));
  }
}

/**
 * Muzlatilgan va eski «INACTIVE» bitta guruh (klient ham ularni bir xil
 * «Muzlatilgan» deb ko'rsatadi). Qolgan holatlar — bitirgan, arxiv, mock —
 * `other` ga tushadi: aks holda bo'laklar yig'indisi jamiga teng bo'lmasdi.
 */
export function splitByStatus(students: { status: string }[]) {
  const count = (...statuses: string[]) =>
    students.filter((s) => statuses.includes(s.status)).length;
  const active = count('ACTIVE');
  const frozen = count('FROZEN', 'INACTIVE');
  const expelled = count('EXPELLED');
  return {
    total: students.length,
    active,
    frozen,
    expelled,
    other: students.length - active - frozen - expelled,
  };
}

/** Kalendarda haqiqatan bor kun (2026-02-31 emas). */
function isRealDate(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Sana berilmasa — joriy Toshkent oyi. Yarim oraliq yoki teskari oraliq rad
 * etiladi: jim nollar «bu davrda hech kim kelmagan» deb o'qilardi.
 */
export function resolvePeriod(input: FunnelPeriodInput): {
  startDate: string;
  endDate: string;
} {
  if (Boolean(input.startDate) !== Boolean(input.endDate)) {
    throw new BadRequestException(
      'Boshlanish va tugash sanasi birga yuborilishi kerak',
    );
  }
  if (input.startDate && input.endDate) {
    if (!isRealDate(input.startDate) || !isRealDate(input.endDate)) {
      throw new BadRequestException("Bunday sana kalendarda yo'q");
    }
    if (input.startDate > input.endDate) {
      throw new BadRequestException(
        "Boshlanish sanasi tugash sanasidan keyin bo'lishi mumkin emas",
      );
    }
    return { startDate: input.startDate, endDate: input.endDate };
  }
  const month = tashkentMonthKey(new Date());
  const next = addMonthsToMonthKey(month, 1);
  return {
    startDate: input.startDate ?? `${month}-01`,
    endDate: input.endDate ?? addDaysToDateStr(`${next}-01`, -1),
  };
}
