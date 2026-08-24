import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  COMMENTABLE_ENTITY_TYPES,
  assertCallerMayTouchCommentEntity,
} from './comment-entity-scope';

/**
 * Comments were the last fully-open surface: `entityType` was a free string,
 * and nothing checked that the entity existed, belonged to this company, or
 * belonged to this caller's branch. `GET /comments?entityType=Student&
 * entityId=<any id>` returned every note staff had written about that student.
 *
 * Production carries 748 of them — Student 487, Lead 232, Group 29 — so this
 * is not a theoretical thread nobody uses.
 *
 * The guard delegates to each record's OWN check rather than inventing a fifth
 * branch rule. These cases pin the two places where the delegation is not
 * uniform, because both are easy to "tidy" into something wrong.
 */
describe('assertCallerMayTouchCommentEntity', () => {
  const FARGONA = 1;
  const NAMANGAN = 2;
  const CALLER = 7;

  function prismaFor(over: Record<string, unknown> = {}) {
    return {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 10264 }) },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      group: { findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }) },
      groupTeacher: { findUnique: jest.fn().mockResolvedValue(null) },
      // The group guard now also asks whether the caller is a SUBSTITUTE on
      // this group (`LessonTeacherOverride`). Null here keeps these cases
      // about the assignment rule they were written for.
      lessonTeacherOverride: { findFirst: jest.fn().mockResolvedValue(null) },
      lead: { findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: CALLER,
          mainBranch: FARGONA,
          branches: [{ branchId: FARGONA }],
          roles: [{ role: { name: 'Branch Director' } }],
        }),
      },
      ...over,
    } as never;
  }

  const call = (
    prisma: never,
    type: string,
    id: string | number = '10264',
    roles: string[] = ['Branch Director'],
  ) => assertCallerMayTouchCommentEntity(prisma, CALLER, roles, type, id, 1001);

  describe('each type is gated by its own record', () => {
    it.each([
      ['Student', '10264'],
      ['Group', 'group-nam'],
      ['Lead', 'lead-nam'],
    ])('refuses %s in another branch', async (type, id) => {
      await expect(call(prismaFor(), type, id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('refuses an employee of another branch', async () => {
      // The caller lookup and the target lookup share `user.findFirst`, so the
      // caller comes back first and the target second.
      const prisma = prismaFor({
        user: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              mainBranch: FARGONA,
              branches: [{ branchId: FARGONA }],
              roles: [{ role: { name: 'Branch Director' } }],
            })
            .mockResolvedValueOnce({
              id: 10500,
              mainBranch: NAMANGAN,
              branches: [{ branchId: NAMANGAN }],
            }),
        },
      });
      await expect(call(prisma, 'User', 10500)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('a Lead with no branch stays readable — deliberately', () => {
    it('allows the shared unassigned pool', async () => {
      // `Lead.branchId` is nullable and null means "not yet assigned": a lead
      // arrives from a public form before anyone knows which branch will teach
      // them, and `leadBranchWhere` already treats that null as a pool every
      // branch works. Refusing here would make the first note anyone writes
      // about a new enquiry impossible.
      const prisma = prismaFor({
        lead: { findFirst: jest.fn().mockResolvedValue({ branchId: null }) },
      });
      await expect(call(prisma, 'Lead', 'lead-new')).resolves.toBeUndefined();
    });

    it('does not filter archived leads out', async () => {
      // Deleting a lead means marking it LOST and archiving it, and the
      // archive page is a real screen. Filtering `deletedAt` here would 404
      // the notes explaining why the lead was lost — the one thing that page
      // is for.
      const prisma = prismaFor({
        lead: { findFirst: jest.fn().mockResolvedValue({ branchId: FARGONA }) },
      });
      await call(prisma, 'Lead', 'lead-lost');
      const where = (prisma as { lead: { findFirst: jest.Mock } }).lead
        .findFirst.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('deletedAt');
    });

    it('404s a lead that does not exist', async () => {
      const prisma = prismaFor({
        lead: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(call(prisma, 'Lead', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('a pure teacher on a Group is checked by ASSIGNMENT', () => {
    it('refuses an unassigned teacher even in the right branch', async () => {
      const prisma = prismaFor({
        group: {
          findFirst: jest.fn().mockResolvedValue({ branchId: FARGONA }),
        },
      });
      await expect(
        call(prisma, 'Group', 'group-far', ['Teacher']),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the assigned teacher', async () => {
      const prisma = prismaFor({
        groupTeacher: {
          findUnique: jest.fn().mockResolvedValue({ groupId: 'group-nam' }),
        },
      });
      await expect(
        call(prisma, 'Group', 'group-nam', ['Teacher']),
      ).resolves.toBeUndefined();
    });
  });

  it('refuses an entity type it does not know how to scope', async () => {
    // Unreachable through the DTO, which validates against the closed list.
    // Reached only by an internal caller adding a type without adding a rule —
    // and the right answer to "I cannot scope this" is a refusal.
    await expect(call(prismaFor(), 'Invoice', 'x')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lists exactly the four types the product uses', () => {
    // Measured, not guessed: production has Student 487, Lead 232, Group 29,
    // and four live screens write User comments even though none exist yet.
    expect([...COMMENTABLE_ENTITY_TYPES].sort()).toEqual([
      'Group',
      'Lead',
      'Student',
      'User',
    ]);
  });

  it('lets a CEO reach every type', async () => {
    const prisma = prismaFor({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
    });
    await expect(
      call(prisma, 'Student', '10264', ['CEO']),
    ).resolves.toBeUndefined();
    await expect(
      call(prisma, 'Group', 'group-nam', ['CEO']),
    ).resolves.toBeUndefined();
  });
});
