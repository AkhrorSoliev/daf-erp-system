import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GroupsService } from './groups.service';
import { GroupsReadService } from './groups-read.service';
import { GroupsWriteService } from './groups-write.service';
import { GroupsStatusService } from './groups-status.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * `GET /groups/:id/students` returns name, phone and BALANCE for every active
 * student in a group, and its `@Roles` list includes Teacher.
 *
 * `@Roles` proves the caller has a role, not that the record is theirs, and it
 * was the only check here — so ANY teacher could read ANY group in the company
 * by id, including groups in a branch they have never worked in. The group
 * LIST was scoped; the roster the list links to was not.
 *
 * The two halves of `assertCallerMayTouchGroup` matter here more than
 * anywhere: a teacher is held to GROUP ASSIGNMENT, which is stricter than
 * branch and is what stops one teacher reading a colleague's register down the
 * hall; admins and directors are held to the branch, because working across
 * their branch's groups is the job.
 */
describe('GroupsService — id-addressed reads are branch-gated', () => {
  let service: GroupsService;
  let prisma: any;
  let read: any;

  const FARGONA = 1;
  const NAMANGAN = 2;
  const GROUP = 'group-nam';

  beforeEach(async () => {
    prisma = {
      group: {
        findFirst: jest.fn().mockResolvedValue({ branchId: NAMANGAN }),
      },
      groupTeacher: { findUnique: jest.fn().mockResolvedValue(null) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: FARGONA,
          branches: [{ branchId: FARGONA }],
          roles: [{ role: { name: 'Branch Director' } }],
        }),
      },
    };
    read = {
      findStudentsByGroupId: jest.fn().mockResolvedValue([]),
      getStatusHistory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupsService,
        { provide: GroupsReadService, useValue: read },
        { provide: GroupsWriteService, useValue: {} },
        { provide: GroupsStatusService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<GroupsService>(GroupsService);
  });

  describe('the roster', () => {
    it('refuses a director of another branch', async () => {
      await expect(
        service.findStudentsByGroupId(GROUP, 1001, 7, ['Branch Director']),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(read.findStudentsByGroupId).not.toHaveBeenCalled();
    });

    it('refuses a teacher who is not assigned to the group', async () => {
      // Even a teacher IN the right branch is refused: assignment is the
      // stricter test, and weakening it to a branch check would open every
      // colleague's register.
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: NAMANGAN,
        branches: [{ branchId: NAMANGAN }],
        roles: [{ role: { name: 'Teacher' } }],
      });
      await expect(
        service.findStudentsByGroupId(GROUP, 1001, 42, ['Teacher']),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(read.findStudentsByGroupId).not.toHaveBeenCalled();
    });

    it('allows the assigned teacher', async () => {
      prisma.groupTeacher.findUnique.mockResolvedValue({ groupId: GROUP });
      await service.findStudentsByGroupId(GROUP, 1001, 42, ['Teacher']);
      expect(read.findStudentsByGroupId).toHaveBeenCalledWith(GROUP, 1001);
    });

    it('allows an admin of the group branch', async () => {
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: NAMANGAN,
        branches: [{ branchId: NAMANGAN }],
        roles: [{ role: { name: 'Administrator' } }],
      });
      await service.findStudentsByGroupId(GROUP, 1001, 8, ['Administrator']);
      expect(read.findStudentsByGroupId).toHaveBeenCalled();
    });

    it('404s a missing group rather than confirming the id', async () => {
      prisma.group.findFirst.mockResolvedValue(null);
      await expect(
        service.findStudentsByGroupId(GROUP, 1001, 7, ['Branch Director']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the status trail', () => {
    it('refuses a director of another branch', async () => {
      await expect(
        service.getStatusHistory(GROUP, 1001, 7, ['Branch Director']),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(read.getStatusHistory).not.toHaveBeenCalled();
    });

    it('lets a CEO through', async () => {
      prisma.user.findFirst.mockResolvedValue({
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      });
      await service.getStatusHistory(GROUP, 1001, 1, ['CEO']);
      expect(read.getStatusHistory).toHaveBeenCalledWith(GROUP, 1001);
    });
  });
});
