/**
 * Filialni bo'shatish rejasi — nima o'chishi va bu xavfsizmi.
 *
 * Namangan (#2) go-live'dan oldin seed ma'lumot bilan to'ldirilgan va noldan
 * qayta ochish uchun tozalanishi kerak bo'ldi. Bu modul o'chirishning O'ZINI
 * qilmaydi: u aniq ID ro'yxatlarini yig'adi, `branch-reset-execute.ts` esa
 * faqat shu ro'yxatlarga tayanadi.
 *
 * Nega ochiq `WHERE branchId = ?` emas. O'chirish qaytarib bo'lmaydi va
 * noto'g'ri yozilgan bitta shart butun filialni yo'q qilishi mumkin. Ro'yxat
 * esa yig'ilgandan keyin `verifyBranchResetPlan` bilan qayta so'raladi: har bir
 * ID chindan ham shu filialga tegishli ekani ikkinchi marta, mustaqil ravishda
 * tasdiqlanadi.
 */
import { Prisma, PrismaClient } from '@prisma/client';

type PrismaLike = PrismaClient | Prisma.TransactionClient;

/** Tekshiruvdan o'tmagan reja. Chiqishi — tranzaksiya bekor bo'lishi. */
export class BranchResetUnsafeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BranchResetUnsafeError';
  }
}

export interface BranchResetPlan {
  branchId: number;
  branchName: string;
  /** Shu filialga biriktirilgan o'quvchilar. */
  studentIds: number[];
  /** Ularning login akkauntlari (`Student.userId`), null bo'lganlari tushadi. */
  studentUserIds: number[];
  /** Filial xodimlari — bir nechta filialda turganlari CHIQARIB TASHLANGAN. */
  staffUserIds: number[];
  /** Ataylab saqlangan ko'p filialli foydalanuvchilar (hozircha faqat CEO). */
  keptUserIds: number[];
  enrollmentIds: string[];
  groupIds: string[];
  roomIds: string[];
  courseIds: string[];
  snapshotIds: number[];
}

export async function buildBranchResetPlan(
  prisma: PrismaLike,
  branchId: number,
): Promise<BranchResetPlan> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, name: true },
  });
  if (!branch) {
    throw new BranchResetUnsafeError(`Filial #${branchId} topilmadi`);
  }

  const studentLinks = await prisma.studentBranch.findMany({
    where: { branchId },
    select: { studentId: true },
  });
  const studentIds = studentLinks.map((r) => r.studentId);

  const students = studentIds.length
    ? await prisma.student.findMany({
        where: { id: { in: studentIds } },
        select: { id: true, userId: true },
      })
    : [];
  const studentUserIds = students
    .map((s) => s.userId)
    .filter((id): id is number => id != null);

  // Xodimlar. Bir nechta filialda turgan har qanday foydalanuvchi chiqarib
  // tashlanadi — bu qoida CEO uchun yozilmagan, umumiy: agar odam boshqa
  // filialda ham ishlayotgan bo'lsa, uni o'chirish o'sha filialni ham buzadi.
  const branchStaff = await prisma.userBranch.findMany({
    where: { branchId },
    select: { userId: true },
  });
  const candidateIds = branchStaff.map((r) => r.userId);
  const allLinksOfCandidates = candidateIds.length
    ? await prisma.userBranch.findMany({
        where: { userId: { in: candidateIds } },
        select: { userId: true, branchId: true },
      })
    : [];
  const linkCount = new Map<number, number>();
  for (const link of allLinksOfCandidates) {
    linkCount.set(link.userId, (linkCount.get(link.userId) ?? 0) + 1);
  }
  const staffUserIds = candidateIds.filter((id) => (linkCount.get(id) ?? 0) <= 1);
  const keptUserIds = candidateIds.filter((id) => (linkCount.get(id) ?? 0) > 1);

  const groups = await prisma.group.findMany({
    where: { branchId },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);

  const enrollments = groupIds.length
    ? await prisma.enrollment.findMany({
        where: { groupId: { in: groupIds } },
        select: { id: true },
      })
    : [];

  const rooms = await prisma.room.findMany({ where: { branchId }, select: { id: true } });
  const courses = await prisma.course.findMany({ where: { branchId }, select: { id: true } });
  const snapshots = await prisma.dailyFinancialSnapshot.findMany({
    where: { branchId },
    select: { id: true },
  });

  return {
    branchId,
    branchName: branch.name,
    studentIds,
    studentUserIds,
    staffUserIds,
    keptUserIds,
    enrollmentIds: enrollments.map((e) => e.id),
    groupIds,
    roomIds: rooms.map((r) => r.id),
    courseIds: courses.map((c) => c.id),
    snapshotIds: snapshots.map((s) => s.id),
  };
}

/**
 * Rejani mustaqil ravishda qayta so'rab tekshiradi. `buildBranchResetPlan`
 * to'g'ri ishlaganiga ishonmaydi: har bir ID to'plami DB dan yana bir bor
 * o'qiladi va boshqa filialga tegishli bironta qator yo'qligi tasdiqlanadi.
 */
export async function verifyBranchResetPlan(
  prisma: PrismaLike,
  plan: BranchResetPlan,
): Promise<void> {
  const problems: string[] = [];

  if (plan.studentIds.length) {
    const strays = await prisma.studentBranch.findMany({
      where: { studentId: { in: plan.studentIds } },
      select: { studentId: true, branchId: true },
    });
    for (const s of strays) {
      if (s.branchId !== plan.branchId) {
        problems.push(`O'quvchi #${s.studentId} #${s.branchId} filialda ham turibdi`);
      }
    }
  }

  if (plan.staffUserIds.length) {
    const strays = await prisma.userBranch.findMany({
      where: { userId: { in: plan.staffUserIds } },
      select: { userId: true, branchId: true },
    });
    for (const u of strays) {
      if (u.branchId !== plan.branchId) {
        problems.push(`Xodim #${u.userId} #${u.branchId} filialda ham turibdi`);
      }
    }
  }

  if (plan.snapshotIds.length) {
    const strays = await prisma.dailyFinancialSnapshot.findMany({
      where: { id: { in: plan.snapshotIds } },
      select: { id: true, branchId: true },
    });
    for (const s of strays) {
      // `branchId: null` — kompaniya darajasidagi qator — reset rejasida
      // HECH QACHON bo'lmasligi kerak, shuning uchun bu ham muammo hisoblanadi.
      if (s.branchId === null) {
        problems.push(`Surat #${s.id} kompaniya darajasidagi qator (branchId yo'q)`);
      } else if (s.branchId !== plan.branchId) {
        problems.push(`Surat #${s.id} #${s.branchId} filialga tegishli`);
      }
    }
  }

  const scoped: [string, string[], () => Promise<{ id: string; branchId: number | null }[]>][] = [
    [
      'Guruh',
      plan.groupIds,
      () =>
        prisma.group.findMany({
          where: { id: { in: plan.groupIds } },
          select: { id: true, branchId: true },
        }),
    ],
    [
      'Xona',
      plan.roomIds,
      () =>
        prisma.room.findMany({
          where: { id: { in: plan.roomIds } },
          select: { id: true, branchId: true },
        }),
    ],
    [
      'Kurs',
      plan.courseIds,
      () =>
        prisma.course.findMany({
          where: { id: { in: plan.courseIds } },
          select: { id: true, branchId: true },
        }),
    ],
  ];
  for (const [label, ids, query] of scoped) {
    if (!ids.length) continue;
    for (const row of await query()) {
      if (row.branchId !== plan.branchId) {
        problems.push(`${label} ${row.id} #${row.branchId} filialga tegishli`);
      }
    }
  }

  if (problems.length) {
    throw new BranchResetUnsafeError(
      `Reja xavfsiz emas, o'chirish bekor qilindi:\n  - ${problems.join('\n  - ')}`,
    );
  }
}
