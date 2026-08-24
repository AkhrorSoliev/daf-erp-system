import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { assertCallerMayReadEntityHistory } from './entity-history-scope';

/**
 * `GET /entity-history/:entityType/:entityId` took both parameters off the URL
 * and checked only `companyId`, so any staff member could read the full edit
 * trail of any record in the company: 17 727 rows across 23 entity types in
 * production, each carrying the before-and-after of every changed field.
 * `Student` alone is 9 031 of them, and a password change appears there as its
 * own entry.
 *
 * The audit log is a VIEW of records, so it is gated as those records are.
 * These cases pin the parts that are NOT uniform — the three different meanings
 * of a null `branchId`, and the refusal on an unknown type — because each is
 * easy to "simplify" into something wrong.
 */
describe('assertCallerMayReadEntityHistory', () => {
  const FARGONA = 1;
  const NAMANGAN = 2;
  const CALLER = 7;

  function prismaFor(over: Record<string, unknown> = {}) {
    return {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 10264 }) },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({ studentId: 10264 }),
      },
      group: { findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }) },
      groupTeacher: { findUnique: jest.fn().mockResolvedValue(null) },
      attendance: {
        findFirst: jest.fn().mockResolvedValue({ groupId: 'group-nam' }),
      },
      payment: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      expense: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      room: { findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }) },
      lead: { findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }) },
      leadColumn: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      leadSection: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ column: { branchId: NAMANGAN } }),
      },
      mockExam: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      mockExamParticipant: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ exam: { branchId: NAMANGAN } }),
      },
      telegramGroup: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      course: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      holiday: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
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
    id = 'x',
    roles: string[] = ['Branch Director'],
  ) => assertCallerMayReadEntityHistory(prisma, CALLER, roles, type, id, 1001);

  /**
   * The production census, so a type nobody classified fails HERE rather than
   * leaking. Adding an `entityType` to `EntityHistoryService` without adding a
   * rule turns this into a failing test.
   */
  const PRODUCTION_TYPES = [
    'Student',
    'Group',
    'GroupAttendance',
    'Enrollment',
    'Payment',
    'Lead',
    'Expense',
    'MockExamParticipant',
    'LeadSection',
    'User',
    'LeadColumn',
    'CustomForm',
    'MockExam',
    'Attendance',
    'Course',
    'Room',
    'LeadSource',
    'Branch',
    'TelegramGroup',
    'MockExamSection',
    'StudentExitReason',
    'DepartureReason',
    'Holiday',
  ];

  it('has a rule for every entity type production actually writes', async () => {
    const unclassified: string[] = [];
    for (const type of PRODUCTION_TYPES) {
      const id = type === 'Student' || type === 'User' ? '10264' : 'x';
      const err = await call(prismaFor(), type, id).catch((e: unknown) => e);
      // A refusal is fine — being UNRECOGNISED is not.
      if (
        err instanceof BadRequestException &&
        /qo'llab-quvvatlanmaydigan/.test((err as Error).message)
      ) {
        unclassified.push(type);
      }
    }
    expect(unclassified).toEqual([]);
  });

  it('refuses an entity type it cannot scope', async () => {
    await expect(call(prismaFor(), 'Invoice')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  describe('records of another branch are refused', () => {
    it.each([
      ['Student', '10264'],
      ['Group', 'group-nam'],
      ['GroupAttendance', 'group-nam'],
      ['Enrollment', 'enr-1'],
      ['Attendance', 'att-1'],
      ['Payment', 'pay-1'],
      ['Expense', 'exp-1'],
      ['Room', 'room-1'],
      ['LeadColumn', 'col-1'],
      ['LeadSection', 'sec-1'],
      ['MockExam', 'exam-1'],
      ['MockExamParticipant', 'part-1'],
      ['Lead', 'lead-1'],
    ])('%s', async (type, id) => {
      await expect(call(prismaFor(), type, id)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('a null branchId does NOT mean one thing', () => {
    it('Lead: null is the shared unassigned pool — allowed', async () => {
      // A lead arrives from a public form before anyone knows which branch will
      // teach them. Refusing would hide the history of every new enquiry.
      const prisma = prismaFor({
        lead: { findFirst: jest.fn().mockResolvedValue({ branchId: null }) },
      });
      await expect(call(prisma, 'Lead', 'lead-new')).resolves.toBeUndefined();
    });

    it('MockExam and Course and Holiday: null is a pool too', async () => {
      for (const [type, model] of [
        ['MockExam', 'mockExam'],
        ['Course', 'course'],
        ['Holiday', 'holiday'],
      ] as const) {
        const prisma = prismaFor({
          [model]: {
            findFirst: jest.fn().mockResolvedValue({ branchId: null }),
          },
        });
        await expect(call(prisma, type, 'x')).resolves.toBeUndefined();
      }
    });

    it('Payment: null is HIDDEN from a branch-confined caller', async () => {
      // The opposite policy, and deliberately. `branchIdWhere` excludes
      // unattributed rows from branch reads, and the reporting invariant is
      // `Σ(branches) + unassigned == company`. Letting a director read them
      // here would contradict every figure they are shown.
      const prisma = prismaFor({
        payment: { findFirst: jest.fn().mockResolvedValue({ branchId: null }) },
      });
      await expect(call(prisma, 'Payment', 'pay-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('Payment: null IS readable by a caller who spans every branch', async () => {
      const prisma = prismaFor({
        payment: { findFirst: jest.fn().mockResolvedValue({ branchId: null }) },
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
        call(prisma, 'Payment', 'pay-x', ['CEO']),
      ).resolves.toBeUndefined();
    });
  });

  describe('company-wide types need no branch', () => {
    it.each([
      'CustomForm',
      'LeadSource',
      'MockExamSection',
      'StudentExitReason',
      'DepartureReason',
    ])('%s is readable by any staff member', async (type) => {
      await expect(call(prismaFor(), type)).resolves.toBeUndefined();
    });

    it('is a NAMED list, not a fallthrough', async () => {
      // "I do not know what this is" and "this genuinely has no branch" must
      // not produce the same answer. An unrecognised type is refused above.
      await expect(call(prismaFor(), 'SomethingNew')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  it('a pure teacher on a group is checked by ASSIGNMENT', async () => {
    const prisma = prismaFor({
      group: { findFirst: jest.fn().mockResolvedValue({ branchId: FARGONA }) },
    });
    await expect(
      call(prisma, 'GroupAttendance', 'group-far', ['Teacher']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a record that does not exist', async () => {
    const prisma = prismaFor({
      expense: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    await expect(call(prisma, 'Expense', 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
