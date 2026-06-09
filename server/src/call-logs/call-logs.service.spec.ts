import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CallLogsService } from './call-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

describe('CallLogsService', () => {
  let service: CallLogsService;
  let prisma: {
    student: { findFirst: jest.Mock };
    enrollment: { findFirst: jest.Mock };
    studentBranch: { findFirst: jest.Mock };
    user: { findUnique: jest.Mock };
    callLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };
  let history: { recordCreate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      student: { findFirst: jest.fn().mockResolvedValue({ id: 10264 }) },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue({ group: { branchId: 3 } }),
      },
      studentBranch: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue({ mainBranch: 3 }) },
      callLog: {
        create: jest.fn().mockImplementation(({ data }) => ({ id: 'c1', ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    history = { recordCreate: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallLogsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: history },
      ],
    }).compile();

    service = module.get(CallLogsService);
  });

  describe('create', () => {
    it('resolves branch from active enrollment, trims note, records history', async () => {
      const res = await service.create(
        { studentId: 10264, reason: 'ABSENCE', outcome: 'NO_ANSWER', note: '  uydagilar  ' },
        99,
        1001,
      );
      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: 10264,
          reason: 'ABSENCE',
          outcome: 'NO_ANSWER',
          note: 'uydagilar',
          calledById: 99,
          branchId: 3,
          companyId: 1001,
        }),
      });
      expect(history.recordCreate).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: 'Student', entityId: '10264' }),
      );
      expect(res.id).toBe('c1');
    });

    it('stores null when note is empty/whitespace', async () => {
      await service.create(
        { studentId: 10264, reason: 'DEBT', outcome: 'PROMISED', note: '   ' },
        99,
        1001,
      );
      expect(prisma.callLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ note: null }),
      });
    });

    it('throws NotFound when the student does not exist', async () => {
      prisma.student.findFirst.mockResolvedValueOnce(null);
      await expect(
        service.create(
          { studentId: 1, reason: 'OTHER', outcome: 'ANSWERED' },
          99,
          1001,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('CEO is not branch-scoped (no branchId filter)', async () => {
      await service.list({
        userId: 99,
        companyId: 1001,
        roles: ['CEO'],
        query: {},
      });
      expect(prisma.callLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ branchId: expect.anything() }),
        }),
      );
    });

    it('Branch Director with no mainBranch returns empty without querying', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ mainBranch: null });
      const res = await service.list({
        userId: 99,
        companyId: 1001,
        roles: ['Branch Director'],
        query: {},
      });
      expect(res).toEqual({ total: 0, page: 1, pageSize: 20, items: [] });
      expect(prisma.callLog.findMany).not.toHaveBeenCalled();
    });

    it('scopes to a single student when studentId is provided', async () => {
      await service.list({
        userId: 99,
        companyId: 1001,
        roles: ['Administrator'],
        query: { studentId: 10264 },
      });
      expect(prisma.callLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ studentId: 10264 }),
        }),
      );
    });
  });
});
