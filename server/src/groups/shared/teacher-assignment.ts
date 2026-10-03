import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Rules for putting a teacher in front of a group's lesson. Shared by the
 * group's own teacher list (create/update) and the one-day substitute
 * (`LessonTeacherOverridesService`): both decide who is paid for the lesson,
 * so a rule that held on one path and not the other was a way around it.
 */

/**
 * A teacher must have a salary rate BEFORE they are put in front of a class.
 *
 * `createAccrual` silently returns null when no rate version covers the
 * lesson date, and a rate cannot be back-dated into a closed payroll period —
 * so lessons taught without a rate earn the teacher nothing, permanently.
 * That is exactly how ~20 mln so'm went missing in May 2026. Blocking the
 * assignment is the last point where this is still fixable.
 */
export async function assertTeachersHaveRate(
  prisma: PrismaLike,
  teacherIds: number[],
): Promise<void> {
  if (!teacherIds.length) return;
  const withRate = await prisma.employeeSalaryConfig.findMany({
    where: { userId: { in: teacherIds }, isActive: true },
    select: { userId: true },
    distinct: ['userId'],
  });
  const haveRate = new Set(withRate.map((c) => c.userId));
  const missing = teacherIds.filter((id) => !haveRate.has(id));
  if (!missing.length) return;

  const users = await prisma.user.findMany({
    where: { id: { in: missing } },
    select: { firstName: true, lastName: true },
  });
  const names = users
    .map((u) => `${u.firstName} ${u.lastName}`.trim())
    .join(', ');
  throw new BadRequestException(
    `Bu ustoz(lar)ga ish haqi stavkasi belgilanmagan: ${names}. ` +
      `Avval stavkani belgilang — aks holda ularning darslari uchun oylik ` +
      `yozilmaydi va buni keyin orqaga tuzatib bo'lmaydi.`,
  );
}

/**
 * A teacher belongs to exactly one branch, and every lesson's pay is booked to
 * the branch of the group it was held in. Assigning a teacher to another
 * branch's group would therefore charge one branch's payroll to the other.
 * Only an explicit mismatch is blocked — a teacher with no branch attached yet
 * is left to the onboarding rules.
 */
export async function assertTeachersInGroupBranch(
  prisma: PrismaLike,
  teacherIds: number[],
  groupBranchId: number,
): Promise<void> {
  if (!teacherIds.length) return;
  const foreign = await prisma.user.findMany({
    where: {
      id: { in: teacherIds },
      branches: { some: {}, none: { branchId: groupBranchId } },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!foreign.length) return;

  const names = foreign
    .map((t) => `${t.firstName} ${t.lastName}`.trim())
    .join(', ');
  throw new BadRequestException(
    `Bu ustoz(lar) boshqa filialga tegishli: ${names}. ` +
      `Guruh filiali bilan mos ustoz tanlang.`,
  );
}
