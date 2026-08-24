import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertCallerInBranch } from './branch-scope';

type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * May this caller act on this group's lessons?
 *
 * ONE rule for every module that touches a lesson, because there are four of
 * them and only one had it. `attendance.controller.ts` carried this logic
 * privately; `lesson-cancellations`, `lesson-reschedules` and
 * `planned-absences` — which manipulate the SAME lessons and, in the
 * cancellation's case, reverse their billing — checked `companyId` and stopped.
 * A Fargona director could cancel a Namangan lesson, which flips its attendance
 * to EXCUSED, reverses the `LESSON_CONSUMPTION`, restores prepaid lessons and
 * reverses the teacher's `SalaryAccrual`. Real money, in a branch they cannot
 * even view.
 *
 * The rule has two halves and they are deliberately different:
 *
 *   - A **pure teacher** is checked by GROUP ASSIGNMENT. That is the stronger
 *     test — being in the branch is not enough to take another teacher's
 *     register — and it is why the branch check is not simply applied to
 *     everyone.
 *   - **Everyone else** (Administrator, Branch Director, CEO) is checked by
 *     BRANCH. An admin legitimately works across their branch's groups, so
 *     per-group assignment would lock them out of their own job.
 *
 * `roles` comes from the caller's own record via `@CurrentUser('roles')`, never
 * from a client-shaped payload.
 */
export async function assertCallerMayTouchGroup(
  prisma: PrismaLike,
  userId: number,
  roles: string[],
  groupId: string,
  message = "Bu guruh boshqa filialga tegishli — u bilan ishlash huquqingiz yo'q",
  options: { lessonDate?: Date } = {},
): Promise<void> {
  const isTeacherOnly = roles.length > 0 && roles.every((r) => r === 'Teacher');

  if (isTeacherOnly) {
    const assigned = await prisma.groupTeacher.findUnique({
      where: { groupId_teacherId: { groupId, teacherId: userId } },
    });
    if (assigned) return;

    // A SUBSTITUTE is not a `GroupTeacher` — that row is the permanent
    // assignment. Until this branch existed, a teacher covering someone else's
    // lesson was told "Siz bu guruhga biriktirilmagansiz" and could not mark
    // the register for a lesson they had just taught. Production shows what
    // that costs: all five substitutions in August were entered by an
    // administrator afterwards, never by the person who was in the room.
    //
    // `lessonDate` narrows it to the day they were actually assigned, so a
    // one-off cover does not become standing access to the group. Callers that
    // have no date (the calendar, the date list) accept ANY active override:
    // they need it to find their day, and someone who taught the group has no
    // less business reading its register than the regular teacher does.
    const override = await prisma.lessonTeacherOverride.findFirst({
      where: {
        groupId,
        deletedAt: null,
        teacherIds: { has: userId },
        ...(options.lessonDate ? { date: options.lessonDate } : {}),
      },
      select: { id: true },
    });
    if (override) return;

    throw new ForbiddenException('Siz bu guruhga biriktirilmagansiz');
  }

  const group = await prisma.group.findFirst({
    where: { id: groupId, deletedAt: null },
    select: { branchId: true },
  });
  // 404 rather than 403 for a missing group: the id is a uuid, and confirming
  // one exists is itself information.
  if (!group) {
    throw new NotFoundException('Guruh topilmadi');
  }

  await assertCallerInBranch(prisma, userId, group.branchId, message);
}
