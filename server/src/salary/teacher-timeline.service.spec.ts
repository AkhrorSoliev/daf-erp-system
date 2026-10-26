import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeacherTimelineService } from './teacher-timeline.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions/permissions.service';
import { fakePermissions } from '../common/permissions/testing';
import { ROLE_ID } from '../common/auth/role-ids';

/**
 * `GET /salary/timeline/:userId` takes `teachers.view`, which the
 * Administrator holds. It took no caller: any employee's rate history in the
 * company, rate values included, went to anyone holding that key, although
 * an Administrator sees no salary (30.09.2026).
 */
describe('TeacherTimelineService.getTimeline', () => {
  let prisma: any;

  const TEACHER = 10050;
  const CALLER = 10012;

  /** Caller, then target, as `assertCallerMayTouchUser` reads them. */
  function people(
    caller: { roles: string[]; branches: number[] },
    targetBranches: number[],
  ) {
    prisma.user.findFirst
      .mockResolvedValueOnce({
        mainBranch: caller.branches[0] ?? null,
        branches: caller.branches.map((branchId) => ({ branchId })),
        roles: caller.roles.map((name) => ({ role: { name } })),
      })
      .mockResolvedValueOnce({
        id: TEACHER,
        mainBranch: targetBranches[0] ?? null,
        branches: targetBranches.map((branchId) => ({ branchId })),
      });
  }

  async function build(roleIds: number[]) {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeacherTimelineService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsService, useValue: fakePermissions(roleIds) },
      ],
    }).compile();
    return module.get(TeacherTimelineService);
  }

  beforeEach(() => {
    prisma = {
      user: { findFirst: jest.fn() },
      employeeSalaryConfigVersion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'v1',
            salaryType: 'PERCENTAGE',
            value: 40,
            effectiveFrom: new Date('2026-06-01'),
            createdAt: new Date('2026-06-01'),
            config: { groupId: null, group: null },
            changedBy: null,
          },
        ]),
      },
      groupTeacherHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'h1',
            groupId: 'g1',
            previousTeacherIds: [],
            newTeacherIds: [TEACHER],
            changeType: 'ADDED',
            changeReason: null,
            createdAt: new Date('2026-07-01'),
            group: { name: 'A1-01' },
            changedBy: null,
          },
        ]),
      },
      entityHistory: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'e1',
            action: 'UPDATE',
            oldValues: { phone: '1' },
            newValues: { phone: '2' },
            createdAt: new Date('2026-08-01'),
            changedBy: null,
          },
        ]),
      },
    };
  });

  it('refuses an employee of another branch and reads none of their history', async () => {
    const service = await build([ROLE_ID.BRANCH_DIRECTOR]);
    people({ roles: ['Branch Director'], branches: [1] }, [2]);

    await expect(service.getTimeline(TEACHER, 1, CALLER)).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.employeeSalaryConfigVersion.findMany).not.toHaveBeenCalled();
    expect(prisma.groupTeacherHistory.findMany).not.toHaveBeenCalled();
    expect(prisma.entityHistory.findMany).not.toHaveBeenCalled();
  });

  it('shows a Branch Director the whole timeline of their own teacher, rates included', async () => {
    const service = await build([ROLE_ID.BRANCH_DIRECTOR]);
    people({ roles: ['Branch Director'], branches: [1] }, [1]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    expect(events.map((e) => e.kind)).toEqual([
      'ProfileUpdated',
      'GroupAdded',
      'SalaryChanged',
    ]);
  });

  it('shows an Administrator no rate: the salary versions are not even read', async () => {
    const service = await build([ROLE_ID.ADMINISTRATOR]);
    people({ roles: ['Administrator'], branches: [1] }, [1]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    expect(events.map((e) => e.kind)).toEqual(['ProfileUpdated', 'GroupAdded']);
    expect(prisma.employeeSalaryConfigVersion.findMany).not.toHaveBeenCalled();
  });

  it('lets the CEO read any employee, rates included', async () => {
    const service = await build([ROLE_ID.CEO]);
    people({ roles: ['CEO'], branches: [] }, [2]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    expect(events.map((e) => e.kind)).toContain('SalaryChanged');
  });

  it('never shows an employee balance stored in an old profile row (ADR-0087)', async () => {
    prisma.entityHistory.findMany.mockResolvedValue([
      {
        id: 'e2',
        action: 'CREATE',
        oldValues: null,
        newValues: { firstName: 'Ali', balance: 1 },
        createdAt: new Date('2026-08-01'),
        changedBy: null,
      },
    ]);
    const service = await build([ROLE_ID.ADMINISTRATOR]);
    people({ roles: ['Administrator'], branches: [1] }, [1]);

    const events = await service.getTimeline(TEACHER, 1, CALLER);

    const profile = events.find((e) => e.kind === 'ProfileUpdated');
    expect(profile?.payload.newValues).toEqual({ firstName: 'Ali' });
    expect(profile?.payload.oldValues).toBeNull();
  });

  it('shows the official salary in an old profile row only to a salary.view holder', async () => {
    prisma.entityHistory.findMany.mockResolvedValue([
      {
        id: 'e3',
        action: 'UPDATE',
        oldValues: { officialSalary: null },
        newValues: { officialSalary: 2_000_000 },
        createdAt: new Date('2026-08-01'),
        changedBy: null,
      },
    ]);
    const profileOf = async (roleIds: number[], roles: string[]) => {
      const service = await build(roleIds);
      people({ roles, branches: [1] }, [1]);
      const events = await service.getTimeline(TEACHER, 1, CALLER);
      return events.find((e) => e.kind === 'ProfileUpdated');
    };

    expect(
      (await profileOf([ROLE_ID.ADMINISTRATOR], ['Administrator']))?.payload
        .newValues,
    ).toEqual({});
    expect(
      (await profileOf([ROLE_ID.CEO], ['CEO']))?.payload.newValues,
    ).toEqual({
      officialSalary: 2_000_000,
    });
  });
});
