import { BadRequestException, Injectable } from '@nestjs/common';
import { AttendanceStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { type ReportBranchIds } from '../../common/finance/report-branch-scope';
import { leadAttributionWhere } from '../../leads/shared/lead-scope';
import {
  addDaysToDateStr,
  addMonthsToMonthKey,
  tashkentDateStr,
  tashkentMonthKey,
  tashkentRangeUtc,
} from '../../common/date/tashkent';
import {
  countByBranch,
  countBySource,
  countStages,
  FUNNEL_START_DATE,
  type FunnelMode,
  type FunnelPerson,
  type FunnelStage,
  matchesSource,
  personsAtStage,
  previousPeriod,
  type StageSets,
  toPersons,
  type UnpaidStatusBucket,
} from './lead-funnel.math';

export type FunnelPeopleStage = FunnelStage | 'unpaid';

export interface FunnelPeriodInput {
  startDate?: string;
  endDate?: string;
}

export interface FunnelPeopleInput extends FunnelPeriodInput {
  stage: FunnelPeopleStage;
  mode: FunnelMode;
  /** Manba id'si yoki `'none'` (manbasizlar); `unpaid` da e'tiborsiz. */
  sourceId?: string;
  /** Faqat `stage === 'unpaid'` da ma'noli. */
  status?: UnpaidStatusBucket;
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
  sourceId: string | null;
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
    const unpaid = await this.loadUnpaid(companyId, scope);

    // KPI kartasidagi «oldingi davr N %» — alohida kogorta; sentyabrda `null`.
    const prevPeriod = previousPeriod(period);
    let previous: {
      period: { startDate: string; endDate: string };
      stages: Record<FunnelStage, number>;
    } | null = null;
    if (prevPeriod) {
      const prev = await this.loadCohort(companyId, prevPeriod, scope);
      previous = {
        period: prevPeriod,
        stages: countStages(prev.persons, prev.sets).stages,
      };
    }

    return {
      period,
      ...countStages(persons, sets),
      previous,
      bySource: countBySource(persons, sets),
      byBranch: countByBranch(persons, sets),
      unpaid: splitByStatus(
        unpaid.map((r) => ({ status: r.studentStatus ?? '' })),
      ),
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
      const all = (await this.loadUnpaid(companyId, scope)).filter(
        (r) => !input.status || statusBucket(r.studentStatus) === input.status,
      );
      return {
        data: all.slice(start, start + pageSize),
        total: all.length,
        page,
        pageSize,
      };
    }

    const period = resolvePeriod(input);
    const { persons, sets } = await this.loadCohort(companyId, period, scope);
    const matched = personsAtStage(
      persons,
      sets,
      input.stage,
      input.mode,
    ).filter((p) => matchesSource(p, input.sourceId));
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
      // `toPersons` ism/telefon/manbani ENG BIRINCHI lidga qarab tanlaydi;
      // aniq tartib bo'lmasa, bitta odam so'rovdan-so'rovga boshqa manbaga
      // bog'lanishi mumkin edi — manbalarni solishtiradigan hisobot uchun bu
      // jiddiy nuqson bo'lardi. `id` — bir xil `createdAt`li lidlar uchun
      // qo'shimcha, barqaror kalit.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        convertedStudentId: true,
        sectionId: true,
        firstName: true,
        lastName: true,
        phone: true,
        createdAt: true,
        source: { select: { name: true } },
        sourceId: true,
        branchId: true,
        branch: { select: { id: true, name: true } },
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
        sourceId: l.sourceId,
        branchId: l.branchId,
        branchName: l.branch?.name ?? null,
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
   * Voronkaga 10.09.2026 dan beri kirgan, darsga kelgan, lekin hali to'lov
   * qilmagan odamlar — bugungi holat bilan.
   *
   * Davr filtriga bog'liq EMAS: boshlanishdan bugungacha hamma. CEO qarori
   * (13.09.2026): karta voronkadagilar bilan cheklanadi — birinchi versiya
   * lidsiz eski o'quvchilarni ham sanardi (205 kishi) va voronka raqamlari
   * bilan aralashardi. Holat bo'yicha bo'linish chaqiruvchida.
   */
  private async loadUnpaid(
    companyId: number,
    scope: ReportBranchIds,
  ): Promise<FunnelPersonRow[]> {
    const { persons, sets } = await this.loadCohort(
      companyId,
      { startDate: FUNNEL_START_DATE, endDate: tashkentDateStr(new Date()) },
      scope,
    );
    return this.withStudentStatus(
      personsAtStage(persons, sets, 'attended', 'stuck'),
    );
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
          select: { id: true, status: true, deletedAt: true },
        })
      : [];
    // O'chirilgan (arxivlangan) o'quvchi holati «Arxivlangan» deb ko'rinadi —
    // aks holda uni hali faol deb o'qish mumkin edi.
    const byId = new Map(
      statuses.map((s) => [
        s.id,
        s.deletedAt ? 'ARCHIVED' : (s.status as string),
      ]),
    );

    return persons.map((p) => ({
      key: p.key,
      name: p.name,
      phone: p.phone,
      studentId: p.studentId,
      studentStatus:
        p.studentId != null ? (byId.get(p.studentId) ?? null) : null,
      source: p.source,
      sourceId: p.sourceId,
      createdAt: p.createdAt,
    }));
  }
}

/**
 * Muzlatilgan va eski «INACTIVE» bitta guruh (klient ham ularni bir xil
 * «Muzlatilgan» deb ko'rsatadi). Qolgan holatlar — bitirgan, arxiv, mock —
 * `other`: aks holda bo'laklar yig'indisi jamiga teng bo'lmasdi.
 */
export function statusBucket(status: string | null): UnpaidStatusBucket {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'FROZEN':
    case 'INACTIVE':
      return 'frozen';
    case 'EXPELLED':
      return 'expelled';
    default:
      return 'other';
  }
}

export function splitByStatus(students: { status: string }[]) {
  const counts = { active: 0, frozen: 0, expelled: 0, other: 0 };
  for (const s of students) counts[statusBucket(s.status)]++;
  return { total: students.length, ...counts };
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
 *
 * Boshlanish `FUNNEL_START_DATE` dan oldin bo'lsa o'sha kunga suriladi;
 * butun oraliq undan oldin bo'lsa rad etiladi. Qaytgan `period` — haqiqatda
 * sanalgan oraliq, klient sarlavhada shuni ko'rsatadi.
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
    if (input.endDate < FUNNEL_START_DATE) {
      throw new BadRequestException(
        'Voronka 10.09.2026 dan boshlab hisoblanadi',
      );
    }
    return {
      startDate: maxDate(input.startDate, FUNNEL_START_DATE),
      endDate: input.endDate,
    };
  }
  const month = tashkentMonthKey(new Date());
  const next = addMonthsToMonthKey(month, 1);
  return {
    startDate: maxDate(`${month}-01`, FUNNEL_START_DATE),
    endDate: addDaysToDateStr(`${next}-01`, -1),
  };
}

/** "YYYY-MM-DD" satrlari leksik tartibda ham sana tartibida. */
function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}
