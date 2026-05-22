import { Prisma, StudentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Uzbek labels for a departed student's status. ACTIVE is clarified as
 * "Faol (guruhsiz)" — an active student who currently has no group.
 */
export const DEPARTED_STATUS_LABELS: Record<StudentStatus, string> = {
  ACTIVE: 'Faol (guruhsiz)',
  FROZEN: 'Muzlatilgan',
  EXPELLED: 'Chetlatilgan',
  INACTIVE: 'Nofaol',
  GRADUATED: 'Bitirgan',
  ARCHIVED: 'Arxivlangan',
};

/**
 * One "departed" student — the single shape every block of the
 * /reports/departed-students page aggregates over (KPIs, dynamics, reasons,
 * group-by). Built from the student-level snapshot so the whole page stays
 * consistent with the "Ketgan o'quvchilar" list.
 */
export interface DepartedStudentRecord {
  studentId: number;
  fullName: string;
  phone: string;
  status: StudentStatus;
  /** Student balance in so'm. Negative means the student owes money (qarz). */
  balance: number;
  /** When the student lost their last group (best-effort). */
  leftAt: Date | null;
  departureReasonId: string | null;
  departureReasonName: string | null;
  lastGroup: { id: string; name: string } | null;
  course: { id: string; name: string } | null;
  branch: { id: number; name: string } | null;
  teachers: { id: number; fullName: string }[];
}

/**
 * Load every "departed" student for a company — a student who currently
 * studies in NO group (zero ACTIVE enrollments), GRADUATED excluded. A FROZEN
 * enrollment does not count as an active group.
 *
 * This is the shared source of truth for the departed-students report: the
 * KPI cards, the dynamics chart, the reasons chart and the group-by chart all
 * aggregate this one list in-memory, so every figure on the page matches the
 * "Ketgan o'quvchilar" table (Faza 1).
 *
 * The set is small (hundreds of rows at most), so in-memory aggregation by the
 * callers is intentional — no need for per-chart SQL.
 */
export async function loadDepartedStudents(
  prisma: PrismaService,
  companyId: number,
  filter?: { branchId?: number },
): Promise<DepartedStudentRecord[]> {
  const where: Prisma.StudentWhereInput = {
    companyId,
    deletedAt: null,
    enrollments: { none: { status: 'ACTIVE', deletedAt: null } },
    status: { not: StudentStatus.GRADUATED },
  };
  if (filter?.branchId !== undefined) {
    where.branches = { some: { branchId: filter.branchId } };
  }

  const students = await prisma.student.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      balance: true,
      statusChangedAt: true,
      statusExitReason: { select: { id: true, name: true } },
      // The most recent enrollment = the last group the student belonged to.
      enrollments: {
        where: { deletedAt: null },
        orderBy: [{ statusChangedAt: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: {
          statusChangedAt: true,
          departureReason: { select: { id: true, name: true } },
          group: {
            select: {
              id: true,
              name: true,
              branch: { select: { id: true, name: true } },
              course: { select: { id: true, name: true } },
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
      },
    },
  });

  return students.map((s) => {
    const lastEnr = s.enrollments[0] ?? null;
    const g = lastEnr?.group ?? null;
    // Reason source depends on how the student left:
    //   FROZEN / EXPELLED / INACTIVE — a status change recorded an exit
    //     reason on the Student itself.
    //   ACTIVE (ungrouped) — no status change; the reason lives on their
    //     last DROPPED enrollment.
    const useStudentReason =
      s.status === StudentStatus.FROZEN ||
      s.status === StudentStatus.EXPELLED ||
      s.status === StudentStatus.INACTIVE;
    const reason = useStudentReason
      ? s.statusExitReason
      : (lastEnr?.departureReason ?? null);

    return {
      studentId: s.id,
      fullName: `${s.firstName} ${s.lastName}`,
      phone: s.phone,
      status: s.status,
      balance: s.balance,
      leftAt: lastEnr?.statusChangedAt ?? s.statusChangedAt ?? null,
      departureReasonId: reason?.id ?? null,
      departureReasonName: reason?.name ?? null,
      lastGroup: g ? { id: g.id, name: g.name } : null,
      course: g?.course ?? null,
      branch: g?.branch ?? null,
      teachers:
        g?.teachers.map((t) => ({
          id: t.teacher.id,
          fullName: `${t.teacher.firstName} ${t.teacher.lastName}`,
        })) ?? [],
    };
  });
}
