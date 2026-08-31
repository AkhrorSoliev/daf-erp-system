import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AttendanceStatus,
  EnrollmentStatus,
  Prisma,
  StudentStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService } from '../common/status';
import {
  StudentQueryDto,
  type StudentStatusFilter,
} from './dto/student-query.dto';
import { equalsOrIn } from '../common/dto/to-array';
import { studentSelect, formatStudent } from './shared/student-select';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { getSystemStartDate } from '../common/finance/system-start-date';
import {
  ReportBranchIds,
  studentBranchWhere,
} from '../common/finance/report-branch-scope';

/**
 * Bitta holat filtri varianti uchun `where` bo'lagi.
 *
 * «Guruhsiz» — bu `Student.status` qiymati emas: u FAOL, lekin hozir hech
 * qaysi faol guruhda o'qimayotgan o'quvchi. Shuning uchun variantlar oddiy
 * enum ro'yxati emas va ular `in` bilan birlashtirilmaydi.
 */
function studentStatusWhere(
  filter: StudentStatusFilter,
): Prisma.StudentWhereInput | null {
  switch (filter) {
    case 'active':
      return {
        status: StudentStatus.ACTIVE,
        enrollments: { some: { deletedAt: null } },
      };
    case 'frozen':
      return { status: StudentStatus.FROZEN };
    case 'ungrouped':
      // Hech qachon guruhga qo'shilmaganlar ham, guruhlari
      // DROPPED/FROZEN/TRANSFERRED bo'lganlar ham shu yerga tushadi — ularning
      // hammasi hali joylashtirilishi kerak.
      return {
        status: StudentStatus.ACTIVE,
        enrollments: {
          none: {
            deletedAt: null,
            status: 'ACTIVE',
            group: { deletedAt: null, statusEnum: 'ACTIVE' },
          },
        },
      };
    case 'graduated':
      return { status: StudentStatus.GRADUATED };
    case 'expelled':
      return { status: StudentStatus.EXPELLED };
    default:
      return null;
  }
}

@Injectable()
export class StudentsReadService {
  constructor(
    private prisma: PrismaService,
    private statusHistoryService: StatusHistoryService,
  ) {}

  async findAll(
    query: StudentQueryDto,
    companyId: number,
    branchScope: ReportBranchIds,
  ) {
    const { page = 1, pageSize = 10, search, status } = query;
    const skip = (page - 1) * pageSize;

    // Base where: company scope + search + teacher + branch (without status filter)
    const baseWhere: Prisma.StudentWhereInput = {
      deletedAt: null,
      companyId,
    };

    if (search) {
      const searchConditions: Prisma.StudentWhereInput[] = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];

      const searchAsNumber = Number(search);
      if (!isNaN(searchAsNumber) && Number.isInteger(searchAsNumber)) {
        searchConditions.push({ id: { equals: searchAsNumber } });
      }

      baseWhere.OR = searchConditions;
    }

    const enrollmentConditions: Prisma.EnrollmentWhereInput[] = [
      { deletedAt: null },
    ];

    if (query.teacher_id?.length) {
      enrollmentConditions.push({
        group: {
          deletedAt: null,
          teachers: { some: { teacherId: equalsOrIn(query.teacher_id) } },
        },
      });
    }

    if (query.group_id?.length) {
      enrollmentConditions.push({ groupId: equalsOrIn(query.group_id) });
    }

    if (query.level?.length) {
      enrollmentConditions.push({
        group: { deletedAt: null, level: equalsOrIn(query.level) },
      });
    }

    if (enrollmentConditions.length > 1) {
      baseWhere.enrollments = { some: { AND: enrollmentConditions } };
    }

    // The branch comes from the resolved request scope, NOT from `query.branch_id`.
    // The raw parameter was a WIDENING filter: omitting it returned the whole
    // company and naming another branch returned that branch, so a Namangan
    // administrator could read Fargona's roster — phones, parent phones,
    // passport series, balances — by editing one query parameter. The guard has
    // already intersected the caller's ceiling with whatever they asked for.
    Object.assign(baseWhere, studentBranchWhere(branchScope));

    // Full where: base + status filter (for main query)
    const where: Prisma.StudentWhereInput = { ...baseWhere };

    // Har bir holat varianti — butun bir `where` bo'lagi, ustun qiymati emas
    // (`ungrouped` umuman `status` ustuniga tayanmaydi), shuning uchun ko'p
    // tanlov `in` bilan emas, OR bilan birlashadi. Bo'lak AND ichiga
    // joylanadi: `where.enrollments` ni o'qituvchi/guruh/daraja filtri
    // allaqachon egallagan bo'lishi mumkin, AND esa ikkovini ham saqlaydi.
    const statusFragments = (status ?? [])
      .map(studentStatusWhere)
      .filter((f): f is Prisma.StudentWhereInput => f !== null);

    if (statusFragments.length > 0) {
      where.AND = [
        ...((where.AND as Prisma.StudentWhereInput[]) ?? []),
        statusFragments.length === 1
          ? statusFragments[0]
          : { OR: statusFragments },
      ];
    }

    // Stats queries use baseWhere (no status filter) so they reflect the full filtered set
    const activeStatsWhere: Prisma.StudentWhereInput = {
      ...baseWhere,
      isActive: true,
    };
    if (baseWhere.enrollments) {
      activeStatsWhere.AND = [
        { enrollments: baseWhere.enrollments },
        { enrollments: { some: { deletedAt: null } } },
      ];
      delete activeStatsWhere.enrollments;
    } else {
      activeStatsWhere.enrollments = { some: { deletedAt: null } };
    }

    // Daraja bo'yicha o'quvchilar soni — filtrlar panelidagi daraja
    // dropdownida har bir daraja yonida ko'rsatiladi. Bu JAMI son: faqat
    // filialga bog'liq, boshqa filtrlarga (o'qituvchi/guruh/qidiruv/holat/
    // tanlangan daraja) bog'liq EMAS. Shunda o'qituvchi tanlanganda ham
    // "shu darajada nechta o'quvchi bor" degan son barqaror qoladi.
    const STUDENT_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
    const levelCountBase: Prisma.StudentWhereInput = {
      deletedAt: null,
      companyId,
      ...studentBranchWhere(branchScope),
    };
    const levelCountPromises = STUDENT_LEVELS.map((lvl) =>
      this.prisma.student.count({
        where: {
          ...levelCountBase,
          enrollments: {
            some: { deletedAt: null, group: { deletedAt: null, level: lvl } },
          },
        },
      }),
    );

    const [
      data,
      total,
      statsTotal,
      activeCount,
      frozenCount,
      debtorCount,
      ...levelCountValues
    ] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: pageSize,
        select: studentSelect,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.student.count({ where }),
      this.prisma.student.count({ where: baseWhere }),
      this.prisma.student.count({ where: activeStatsWhere }),
      this.prisma.student.count({
        where: { ...baseWhere, status: StudentStatus.FROZEN },
      }),
      this.prisma.student.count({
        where: { ...baseWhere, balance: { lt: 0 } },
      }),
      ...levelCountPromises,
    ]);

    const levelCounts: Record<string, number> = {};
    STUDENT_LEVELS.forEach((lvl, i) => {
      levelCounts[lvl] = levelCountValues[i];
    });

    return {
      data: data.map(formatStudent),
      total,
      page,
      pageSize,
      stats: {
        total: statsTotal,
        active: activeCount,
        frozen: frozenCount,
        debtors: debtorCount,
      },
      levelCounts,
    };
  }

  async findById(id: number, companyId: number, branchScope: ReportBranchIds) {
    // Confined by branch as well as company: `@Roles` proves the caller is
    // staff, not that this student is theirs. A bare id let one branch's admin
    // open any student in the company — full PII plus balance. Out of scope
    // reads as "not found" rather than 403 so the id itself leaks nothing.
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, ...studentBranchWhere(branchScope) },
      select: studentSelect,
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    const lastTxn = await this.prisma.transaction.findFirst({
      where: { studentId: id },
      orderBy: { createdAt: 'desc' },
      select: { type: true },
    });

    return {
      ...formatStudent(student),
      lastTransactionType: lastTxn?.type ?? null,
    };
  }

  async getStatusHistory(id: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId },
      select: { id: true },
    });

    if (!student) {
      throw new NotFoundException(`O'quvchi topilmadi`);
    }

    return this.statusHistoryService.getHistory('Student', String(id));
  }

  /**
   * Active enrollments enriched with prepaid + per-lesson cost + already-
   * consumed lesson count. Used by the FROZEN status dialog so the admin
   * can preview "X dars × Y so'm = Z so'm balansga qaytariladi" before
   * confirming, and adjust the per-enrollment refund count if needed.
   *
   * Cap on the override input is `prepaidLessonsRemaining + consumedLessons` —
   * the admin can roll back as far as the very first paid lesson but no
   * further (we have no money to refund beyond what was actually deducted).
   */
  async getActiveEnrollmentsWithPrepaid(id: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException(`O'quvchi topilmadi`);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: id,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        prepaidLessonsRemaining: true,
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { price: true, lessonPaymentCount: true } },
          },
        },
      },
    });

    if (enrollments.length === 0) return [];

    // perLessonCost: prefer the most recent unreversed LESSON_DEDUCTION
    // metadata so course price changes after the deduction don't inflate
    // the displayed refund. Falls back to current course price.
    const enrollmentIds = enrollments.map((e) => e.id);
    const recentDeductions = await this.prisma.transaction.findMany({
      where: {
        enrollmentId: { in: enrollmentIds },
        type: 'LESSON_DEDUCTION',
        reversedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { enrollmentId: true, metadata: true },
    });
    const perLessonByEnrollment = new Map<string, number>();
    for (const d of recentDeductions) {
      if (perLessonByEnrollment.has(d.enrollmentId!)) continue; // first wins (most recent)
      const meta = d.metadata as { perLessonCost?: number } | null | undefined;
      if (
        meta &&
        typeof meta.perLessonCost === 'number' &&
        meta.perLessonCost > 0
      ) {
        perLessonByEnrollment.set(d.enrollmentId!, meta.perLessonCost);
      }
    }

    // Consumption count per enrollment — matches what refundPrepaidWithOverride
    // can actually reverse if the admin asks for more than current prepaid.
    const consumptionGroups = await this.prisma.transaction.groupBy({
      by: ['enrollmentId'],
      where: {
        enrollmentId: { in: enrollmentIds },
        type: 'LESSON_CONSUMPTION',
        reversedAt: null,
      },
      _count: true,
    });
    const consumedByEnrollment = new Map<string, number>();
    for (const g of consumptionGroups) {
      consumedByEnrollment.set(g.enrollmentId!, g._count);
    }

    return enrollments.map((e) => {
      const fallback = Math.round(
        e.group.course.price / (e.group.course.lessonPaymentCount || 12),
      );
      const perLessonCost = perLessonByEnrollment.get(e.id) ?? fallback;
      const consumedLessons = consumedByEnrollment.get(e.id) ?? 0;
      return {
        enrollmentId: e.id,
        groupId: e.group.id,
        groupName: e.group.name,
        prepaidLessonsRemaining: e.prepaidLessonsRemaining,
        perLessonCost,
        consumedLessons,
        maxRefundable: e.prepaidLessonsRemaining + consumedLessons,
        suggestedRefundAmount: e.prepaidLessonsRemaining * perLessonCost,
      };
    });
  }

  /**
   * Closed enrollments (DROPPED / FROZEN) of a student — surfaces them in
   * the profile UI so admins can write off lingering current-cycle debt
   * on already-closed enrollments. The endpoint returns only the metadata
   * the profile section needs to render row + decide whether to show the
   * write-off button; eligibility per row is computed on-demand by the
   * dedicated eligibility endpoint when the modal opens.
   */
  async getClosedEnrollments(id: number, companyId: number) {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException(`O'quvchi topilmadi`);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: id,
        deletedAt: null,
        status: { in: ['DROPPED', 'FROZEN'] },
      },
      orderBy: { statusChangedAt: 'desc' },
      select: {
        id: true,
        status: true,
        statusChangedAt: true,
        statusChangeReason: true,
        createdAt: true,
        group: {
          select: {
            id: true,
            name: true,
            level: true,
            course: {
              select: { name: true, lessonPaymentCount: true },
            },
            teachers: {
              select: {
                teacher: {
                  select: { id: true, firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      groupId: e.group.id,
      groupName: e.group.name,
      level: e.group.level,
      courseName: e.group.course?.name ?? null,
      lessonPaymentCount: e.group.course?.lessonPaymentCount ?? 12,
      status: e.status,
      statusChangedAt: e.statusChangedAt?.toISOString() ?? null,
      statusChangeReason: e.statusChangeReason,
      enrolledAt: e.createdAt.toISOString(),
      teachers: (e.group.teachers ?? []).map((gt) => gt.teacher),
    }));
  }

  /**
   * O'quvchi monitoringi uchun "Darslar" ko'rinishi: har bir guruh bo'yicha
   * o'quvchining DAVOMATI (kelgan/kelmagan/kech/sababli), darslar sana bo'yicha
   * tartibda, har `lessonPaymentCount` tasi bitta SIKL bloki qilib guruhlangan.
   *
   * MUHIM: sikl bu yerda = kurs darslari soni (lessonPaymentCount, 12/20) talik
   * BLOK — moliyaviy LESSON_DEDUCTION bo'lagi EMAS. Qarzdor o'quvchida deduction
   * bo'laklari 1 talikka parchalanadi (SINGLE_UNCOVERED) va sana tartibi
   * buziladi; monitoring uchun bu chalkash. To'lov-dars bog'lanishi (deduction
   * coverage) To'lovlar tabida ko'rsatiladi, bu yerda emas.
   *
   * `includeClosed=false` (default) — faqat ACTIVE enrollment'lar. true bo'lsa
   * yopilganlar (FROZEN/COMPLETED/DROPPED/TRANSFERRED) ham qo'shiladi.
   *
   * TARTIB: guruhlar ENG SO'NGGI dars sanasi bo'yicha kamayish tartibida —
   * eng oxirgi o'qigan guruhi tepada, eskilari pastda. Avval tartib
   * `status asc, createdAt asc` edi: bu ikki xil o'lchovni aralashtirardi, ya'ni
   * faol guruh darsi qachon bo'lganidan qat'i nazar tepaga chiqar, yopilganlari
   * esa o'z ichida eskidan yangiga qarab terilardi. O'quvchining dars tarixi
   * shu sababli vaqt bo'yicha uzilib ko'rinardi.
   */
  async getLessonsOverview(
    id: number,
    companyId: number,
    includeClosed = false,
  ) {
    const student = await this.prisma.student.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!student) throw new NotFoundException(`O'quvchi topilmadi`);

    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        studentId: id,
        deletedAt: null,
        ...(includeClosed ? {} : { status: EnrollmentStatus.ACTIVE }),
        // includeClosed ALSO lifts the group's soft-delete filter. An archived
        // group is "yopilgan" in exactly the sense the toggle means — and its
        // attendance rows are still in the DB. Without this, a student whose
        // only group was archived (204 students / 20 groups in prod when this
        // was found) had a permanently empty Darslar tab that no toggle could
        // open. Default (toggle off) still hides archived groups.
        group: includeClosed ? { companyId } : { companyId, deletedAt: null },
      },
      // Haqiqiy tartib pastda, dars sanalari yig'ilgandan keyin beriladi (SQL
      // buni qila olmaydi — kalit attendance'dan keladi). Bu yerdagi tartib
      // faqat teng holatlar uchun barqaror asos.
      orderBy: [{ createdAt: 'asc' }],
      select: {
        id: true,
        status: true,
        startDate: true,
        createdAt: true,
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { name: true, lessonPaymentCount: true } },
          },
        },
      },
    });

    if (enrollments.length === 0) {
      return { studentId: id, groups: [] };
    }

    const groupIds = enrollments.map((e) => e.group.id);

    // Cutover floor: don't surface lessons before the company's
    // systemStartDate (mid-April 2026 go-live). Lessons stay in the DB (still
    // queryable elsewhere) — they just don't appear in the Darslar tab, so
    // cycles re-group cleanly from May 1. NULL floor => unchanged.
    const systemStart = await getSystemStartDate(this.prisma, companyId);

    // O'quvchining shu guruhlardagi haqiqiy davomat qatorlari (faqat shu
    // o'quvchi — getLessonSequence'ning butun-guruh fetch'idan ancha kichik).
    const attendances = await this.prisma.attendance.findMany({
      where: {
        studentId: id,
        groupId: { in: groupIds },
        ...(systemStart ? { date: { gte: systemStart } } : {}),
      },
      select: { id: true, groupId: true, date: true, status: true },
      orderBy: { date: 'asc' },
    });

    // enrollmentId → tartib kaliti (pastdagi sort uchun). Kalit = guruhning eng
    // so'nggi dars sanasi; darsi hali yo'q guruh uchun enrollment startDate,
    // u ham bo'lmasa yozilgan sana. Hali darsi yo'q YANGI guruh shu tufayli
    // tepada qoladi — bo'sh kalit bilan u eng pastga tushib ketardi.
    const sortKey = new Map<string, string>();

    const groups = enrollments.map((e) => {
      // lpc = kurs darslari soni (NEVER hardcoded 12) — sikl blok o'lchami.
      const lpc = e.group.course?.lessonPaymentCount || 12;
      const groupAtts = attendances.filter((a) => a.groupId === e.group.id);

      // Darslarni sana bo'yicha tartibda lpc talik bloklarga ajratamiz; har
      // darsning sikl raqami = floor(index / lpc) + 1.
      const lessons = groupAtts.map((a, index) => ({
        date: tashkentDateStr(a.date),
        status: a.status,
        cycleSequenceNumber: Math.floor(index / lpc) + 1,
      }));

      const attended = lessons.filter(
        (l) =>
          l.status === AttendanceStatus.PRESENT ||
          l.status === AttendanceStatus.LATE,
      ).length;

      // Har blok uchun: sana oralig'i + dars soni + kelgan soni.
      const cyclesMap = new Map<
        number,
        {
          cycleSequenceNumber: number;
          capacity: number;
          lessonCount: number;
          attended: number;
          firstDate: string;
          lastDate: string;
        }
      >();
      for (const l of lessons) {
        const seq = l.cycleSequenceNumber;
        const existing = cyclesMap.get(seq);
        const isAttended =
          l.status === AttendanceStatus.PRESENT ||
          l.status === AttendanceStatus.LATE;
        if (!existing) {
          cyclesMap.set(seq, {
            cycleSequenceNumber: seq,
            capacity: lpc,
            lessonCount: 1,
            attended: isAttended ? 1 : 0,
            firstDate: l.date,
            lastDate: l.date,
          });
        } else {
          existing.lessonCount += 1;
          if (isAttended) existing.attended += 1;
          // lessons sana bo'yicha tartibda → oxirgisi eng kech.
          existing.lastDate = l.date;
        }
      }
      const cycles = Array.from(cyclesMap.values()).sort(
        (a, b) => a.cycleSequenceNumber - b.cycleSequenceNumber,
      );

      // lessons sana bo'yicha o'sish tartibida → oxirgisi eng so'nggi dars.
      // Ikki guruhning so'nggi darsi bir kunga to'g'ri kelishi mumkin (bir
      // kunda eski guruhdan chiqib yangisiga o'tgan o'quvchi), shuning uchun
      // kalitga createdAt qo'shiladi: teng kunda keyinroq yozilgani tepada.
      const lastDate =
        lessons.length > 0
          ? lessons[lessons.length - 1].date
          : e.startDate
            ? tashkentDateStr(e.startDate)
            : tashkentDateStr(e.createdAt);
      sortKey.set(e.id, `${lastDate}|${e.createdAt.toISOString()}`);

      return {
        enrollmentId: e.id,
        groupId: e.group.id,
        groupName: e.group.name,
        courseName: e.group.course?.name ?? null,
        lessonPaymentCount: lpc,
        status: e.status,
        attended,
        total: lessons.length,
        cycles,
        lessons,
      };
    });

    // Eng so'nggi dars sanasi bo'yicha kamayish tartibi. Sanalar "YYYY-MM-DD"
    // bo'lgani uchun matn solishtiruvi xronologik solishtiruv bilan bir xil.
    groups.sort((a, b) => {
      const ka = sortKey.get(a.enrollmentId) ?? '';
      const kb = sortKey.get(b.enrollmentId) ?? '';
      return kb.localeCompare(ka);
    });

    return { studentId: id, groups };
  }
}
