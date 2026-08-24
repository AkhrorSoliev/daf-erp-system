import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { assertCallerMayTouchGroup } from './group-branch-scope';

/**
 * Attendance was guarded. The three modules that manipulate the SAME lessons
 * were not.
 *
 * `attendance.controller.ts` carried this rule privately, so
 * `lesson-cancellations`, `lesson-reschedules` and `planned-absences` each
 * shipped checking `companyId` and nothing else. Cancelling is the worst of the
 * three: it flips attendance to EXCUSED, reverses the `LESSON_CONSUMPTION`,
 * restores prepaid lessons and reverses the teacher's `SalaryAccrual` — real
 * money, in a branch the caller cannot even view.
 *
 * The rule now lives in one place. These cases pin the two halves that make it
 * correct, because they are deliberately different and the difference is easy
 * to "simplify" away.
 */
describe('assertCallerMayTouchGroup', () => {
  const GROUP = 'group-1';

  function prismaFor(opts: {
    assigned?: boolean;
    /** An active LessonTeacherOverride the query would return, if any. */
    override?: boolean;
    groupBranch?: number | null;
    caller?: {
      mainBranch: number | null;
      branches: { branchId: number }[];
      role: string;
    };
  }) {
    return {
      groupTeacher: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts.assigned ? { groupId: GROUP } : null),
      },
      lessonTeacherOverride: {
        findFirst: jest
          .fn()
          .mockResolvedValue(opts.override ? { id: 'ovr-1' } : null),
      },
      group: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            opts.groupBranch === null
              ? null
              : { branchId: opts.groupBranch ?? 1 },
          ),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(
          opts.caller
            ? {
                mainBranch: opts.caller.mainBranch,
                branches: opts.caller.branches,
                roles: [{ role: { name: opts.caller.role } }],
              }
            : null,
        ),
      },
    } as never;
  }

  describe('a pure teacher is checked by ASSIGNMENT, not by branch', () => {
    it('allows a teacher assigned to the group', async () => {
      const prisma = prismaFor({ assigned: true });
      await expect(
        assertCallerMayTouchGroup(prisma, 42, ['Teacher'], GROUP),
      ).resolves.toBeUndefined();
    });

    it('refuses a teacher who is NOT assigned, even in the right branch', async () => {
      // Assignment is the STRONGER test and must not be weakened to a branch
      // check: being in the branch does not entitle a teacher to another
      // teacher's register.
      const prisma = prismaFor({ assigned: false });
      await expect(
        assertCallerMayTouchGroup(prisma, 42, ['Teacher'], GROUP),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not read the group at all for a teacher', async () => {
      const prisma = prismaFor({ assigned: true });
      await assertCallerMayTouchGroup(prisma, 42, ['Teacher'], GROUP);
      expect(
        (prisma as { group: { findFirst: jest.Mock } }).group.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe('everyone else is checked by BRANCH', () => {
    it('allows an admin of the group branch', async () => {
      const prisma = prismaFor({
        groupBranch: 1,
        caller: {
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          role: 'Administrator',
        },
      });
      await expect(
        assertCallerMayTouchGroup(prisma, 7, ['Administrator'], GROUP),
      ).resolves.toBeUndefined();
    });

    it('refuses a director of another branch', async () => {
      // The case that was open: a Fargona director cancelling a Namangan
      // lesson, which reverses that lesson's billing.
      const prisma = prismaFor({
        groupBranch: 2,
        caller: {
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          role: 'Branch Director',
        },
      });
      await expect(
        assertCallerMayTouchGroup(prisma, 7, ['Branch Director'], GROUP),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a CEO through — they span every branch', async () => {
      const prisma = prismaFor({
        groupBranch: 2,
        caller: { mainBranch: null, branches: [], role: 'CEO' },
      });
      await expect(
        assertCallerMayTouchGroup(prisma, 1, ['CEO'], GROUP),
      ).resolves.toBeUndefined();
    });

    it('is used by a teacher who ALSO holds another role', async () => {
      // `every(r => r === 'Teacher')` — a teaching Branch Director is not a
      // "pure teacher", so they take the branch path. Reading this as "has the
      // Teacher role" would confine them to their assigned groups and lock
      // them out of the branch they run.
      const prisma = prismaFor({
        assigned: false,
        groupBranch: 1,
        caller: {
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          role: 'Branch Director',
        },
      });
      await expect(
        assertCallerMayTouchGroup(
          prisma,
          7,
          ['Teacher', 'Branch Director'],
          GROUP,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('fails closed', () => {
    it('404s on a missing group rather than confirming the id', async () => {
      const prisma = prismaFor({ groupBranch: null });
      await expect(
        assertCallerMayTouchGroup(prisma, 7, ['Administrator'], GROUP),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an unidentified caller', async () => {
      const prisma = prismaFor({
        groupBranch: 1,
        caller: {
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          role: 'Administrator',
        },
      });
      await expect(
        assertCallerMayTouchGroup(prisma, undefined as never, [], GROUP),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an empty roles list against another branch', async () => {
      // An empty list is not "teacher", so it takes the branch path — which is
      // the safe default rather than a bypass.
      const prisma = prismaFor({
        groupBranch: 2,
        caller: {
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          role: 'Administrator',
        },
      });
      await expect(
        assertCallerMayTouchGroup(prisma, 7, [], GROUP),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  /**
   * A substitute is not a `GroupTeacher` — that row is the PERMANENT
   * assignment. Before this, a teacher covering someone else's lesson was told
   * "Siz bu guruhga biriktirilmagansiz" and could not mark a register for a
   * lesson they had just taught. All five substitutions in production during
   * August were entered by an administrator afterwards.
   *
   * The cover expires the day after the lesson (CEO, 2026-08-24), so these
   * dates are built RELATIVE TO TODAY. A fixed calendar date would pass on the
   * day it was written and start failing the next morning — which is exactly
   * what happened to the first version of this block.
   */
  describe('a substitute is admitted for the day they were assigned', () => {
    const TEACHER = 42;
    const dayOffset = (days: number) => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      return new Date(d.getTime() + days * 86400000);
    };
    const TODAY = dayOffset(0);
    const TOMORROW = dayOffset(1);
    const YESTERDAY = dayOffset(-1);

    it("allows a substitute on today's lesson", async () => {
      const prisma = prismaFor({ assigned: false, override: true });
      await expect(
        assertCallerMayTouchGroup(
          prisma,
          TEACHER,
          ['Teacher'],
          GROUP,
          undefined,
          {
            lessonDate: TODAY,
          },
        ),
      ).resolves.toBeUndefined();
    });

    it('allows a cover booked for a future date', async () => {
      const prisma = prismaFor({ assigned: false, override: true });
      await expect(
        assertCallerMayTouchGroup(
          prisma,
          TEACHER,
          ['Teacher'],
          GROUP,
          undefined,
          {
            lessonDate: TOMORROW,
          },
        ),
      ).resolves.toBeUndefined();
    });

    it('REFUSES yesterday, even if the override row is still there', async () => {
      // The row is not deleted — a cover is payroll history. It simply stops
      // granting access once its day is over.
      const prisma = prismaFor({ assigned: false, override: true });
      await expect(
        assertCallerMayTouchGroup(
          prisma,
          TEACHER,
          ['Teacher'],
          GROUP,
          undefined,
          {
            lessonDate: YESTERDAY,
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('narrows the query to that date AND to covers still in force', async () => {
      const prisma = prismaFor({ assigned: false, override: true });
      await assertCallerMayTouchGroup(
        prisma,
        TEACHER,
        ['Teacher'],
        GROUP,
        undefined,
        {
          lessonDate: TODAY,
        },
      );

      const where = (prisma as any).lessonTeacherOverride.findFirst.mock
        .calls[0][0].where;
      expect(where.groupId).toBe(GROUP);
      expect(where.deletedAt).toBeNull();
      // The teacher must be IN the override, not merely near it.
      expect(where.teacherIds).toEqual({ has: TEACHER });
      expect(where.date).toEqual(TODAY);
    });

    it('accepts a current cover when the caller names no date', async () => {
      // The calendar and date-list routes have no single date; a teacher needs
      // them to find their day. The `gte` floor still applies.
      const prisma = prismaFor({ assigned: false, override: true });
      await assertCallerMayTouchGroup(prisma, TEACHER, ['Teacher'], GROUP);

      const where = (prisma as any).lessonTeacherOverride.findFirst.mock
        .calls[0][0].where;
      expect(where.date).toEqual({ gte: TODAY });
    });

    it('does not consult overrides at all for an assigned teacher', async () => {
      const prisma = prismaFor({ assigned: true, override: false });
      await assertCallerMayTouchGroup(prisma, TEACHER, ['Teacher'], GROUP);
      expect(
        (prisma as any).lessonTeacherOverride.findFirst,
      ).not.toHaveBeenCalled();
    });

    it('still refuses a teacher with neither assignment nor cover', async () => {
      const prisma = prismaFor({ assigned: false, override: false });
      await expect(
        assertCallerMayTouchGroup(prisma, TEACHER, ['Teacher'], GROUP),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('changes nothing for an admin — they are still checked by branch', async () => {
      const prisma = prismaFor({
        assigned: false,
        override: true,
        groupBranch: 2,
        caller: {
          mainBranch: 1,
          branches: [{ branchId: 1 }],
          role: 'Administrator',
        },
      });
      await expect(
        assertCallerMayTouchGroup(prisma, 7, ['Administrator'], GROUP),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(
        (prisma as any).lessonTeacherOverride.findFirst,
      ).not.toHaveBeenCalled();
    });
  });
});
