import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { SearchService, SearchContext } from './search.service';
import { PrismaService } from '../prisma/prisma.service';

const ceoCtx: SearchContext = { companyId: 1, roles: ['CEO'], userId: 10001 };
const bdCtx: SearchContext = {
  companyId: 1,
  roles: ['Branch Director'],
  userId: 10002,
};

describe('SearchService', () => {
  let service: SearchService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      student: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      group: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      course: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      userBranch: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SearchService);
  });

  describe('quickSearch()', () => {
    it('should return all categories with empty results', async () => {
      const result = await service.quickSearch('test', ceoCtx);

      expect(result).toHaveProperty('students');
      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('teachers');
      expect(result).toHaveProperty('groups');
      expect(result).toHaveProperty('courses');
      expect(result.students).toEqual({ items: [], total: 0 });
    });

    it('should search by name with ILIKE conditions', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 10001,
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '901234567',
          photo: null,
          balance: -50000,
          enrollments: [
            {
              group: {
                name: 'B2-Gruppe',
                teachers: [
                  { teacher: { firstName: 'Max', lastName: 'Müller' } },
                ],
              },
            },
          ],
        },
      ]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.quickSearch('ali', ceoCtx);

      expect(result.students.items).toHaveLength(1);
      expect(result.students.items[0]).toEqual({
        id: 10001,
        label: 'Ali Valiyev',
        phone: '901234567',
        photo: null,
        groupName: 'B2-Gruppe',
        teacherName: 'Max Müller',
        balance: -50000, // negative = debt
      });
      expect(result.students.total).toBe(1);
    });

    it('should return null balance for non-debtor students', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 10001,
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '901234567',
          photo: null,
          balance: 100000,
          enrollments: [],
        },
      ]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.quickSearch('ali', ceoCtx);

      expect(result.students.items[0].balance).toBe(100000);
      expect(result.students.items[0].groupName).toBeNull();
      expect(result.students.items[0].teacherName).toBeNull();
    });

    it('should search by full name (multi-word query)', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 10001,
          firstName: 'Ali',
          lastName: 'Valiyev',
          phone: '901234567',
          photo: null,
          balance: 0,
          enrollments: [],
        },
      ]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.quickSearch('Ali Valiyev', ceoCtx);

      expect(result.students.items).toHaveLength(1);
      expect(result.students.items[0].label).toBe('Ali Valiyev');

      // Should use firstName+lastName combined search
      const studentCall = prisma.student.findMany.mock.calls[0][0];
      expect(studentCall.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            firstName: { contains: 'Ali', mode: 'insensitive' },
            lastName: { contains: 'Valiyev', mode: 'insensitive' },
          }),
        ]),
      );
    });

    it('should search by exact ID when query starts with #', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 10234,
          firstName: 'Test',
          lastName: 'Student',
          phone: '901111111',
          photo: null,
          balance: 0,
          enrollments: [],
        },
      ]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.quickSearch('#10234', ceoCtx);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            companyId: 1,
            id: { equals: 10234 },
          }),
        }),
      );
      expect(result.students.items[0].id).toBe(10234);
    });

    it('should search by phone when query is numeric', async () => {
      await service.quickSearch('901234567', ceoCtx);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
            companyId: 1,
            OR: expect.arrayContaining([{ phone: { contains: '901234567' } }]),
          }),
        }),
      );
    });

    it('should search groups by name', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'uuid-1', name: 'B2-Gruppe', groupNumber: 5 },
      ]);
      prisma.group.count.mockResolvedValue(1);

      const result = await service.quickSearch('B2', ceoCtx);

      expect(result.groups.items).toHaveLength(1);
      expect(result.groups.items[0]).toEqual({
        id: 'uuid-1',
        label: 'B2-Gruppe',
        sublabel: '#5',
      });
    });

    it('should filter teachers by roleId 4', async () => {
      await service.quickSearch('ali', ceoCtx);

      const teacherCall = prisma.user.findMany.mock.calls.find(
        (call: any[]) => call[0]?.where?.roles?.some?.roleId === 4,
      );
      expect(teacherCall).toBeDefined();
    });

    it('should exclude teachers from users category (no duplicates)', async () => {
      await service.quickSearch('ali', ceoCtx);

      const userCall = prisma.user.findMany.mock.calls.find(
        (call: any[]) =>
          JSON.stringify(call[0]?.where?.roles?.some?.roleId) ===
          JSON.stringify({ in: [1, 2, 3, 5] }),
      );
      expect(userCall).toBeDefined();
      // Users category should exclude teachers (roleId: 4)
      expect(userCall[0].where.roles.none).toEqual({ roleId: 4 });
    });

    it('should log warning when search takes over 500ms', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

      prisma.student.findMany.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 600)),
      );

      await service.quickSearch('slow', ceoCtx);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Global search took'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('companyId isolation', () => {
    it('should always filter by companyId', async () => {
      await service.quickSearch('test', ceoCtx);

      // Every entity query should include companyId
      for (const call of prisma.student.findMany.mock.calls) {
        expect(call[0].where.companyId).toBe(1);
      }
      for (const call of prisma.user.findMany.mock.calls) {
        expect(call[0].where.companyId).toBe(1);
      }
      for (const call of prisma.group.findMany.mock.calls) {
        expect(call[0].where.companyId).toBe(1);
      }
      for (const call of prisma.course.findMany.mock.calls) {
        expect(call[0].where.companyId).toBe(1);
      }
    });
  });

  describe('branch filtering', () => {
    it('should NOT filter by branch for CEO', async () => {
      await service.quickSearch('test', ceoCtx);

      // CEO: no branch filter, no userBranch lookup
      expect(prisma.userBranch.findMany).not.toHaveBeenCalled();

      const studentCall = prisma.student.findMany.mock.calls[0][0];
      expect(studentCall.where.branches).toBeUndefined();
    });

    it('should filter by branch for Branch Director', async () => {
      prisma.userBranch.findMany.mockResolvedValue([
        { branchId: 1 },
        { branchId: 3 },
      ]);

      await service.quickSearch('test', bdCtx);

      // Should have fetched user branches
      expect(prisma.userBranch.findMany).toHaveBeenCalledWith({
        where: { userId: 10002 },
        select: { branchId: true },
      });

      // Student should be filtered by branch
      const studentCall = prisma.student.findMany.mock.calls[0][0];
      expect(studentCall.where.branches).toEqual({
        some: { branchId: { in: [1, 3] } },
      });

      // Group should be filtered by branch
      const groupCall = prisma.group.findMany.mock.calls[0][0];
      expect(groupCall.where.branchId).toEqual({ in: [1, 3] });
    });
  });

  describe('relevance sorting', () => {
    it('should sort exact match first, then starts-with, then contains', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 1,
          firstName: 'Alisher',
          lastName: 'K',
          phone: null,
          photo: null,
          balance: 0,
          enrollments: [],
        },
        {
          id: 2,
          firstName: 'Ali',
          lastName: 'V',
          phone: null,
          photo: null,
          balance: 0,
          enrollments: [],
        },
        {
          id: 3,
          firstName: 'Salim',
          lastName: 'Ali',
          phone: null,
          photo: null,
          balance: 0,
          enrollments: [],
        },
      ]);
      prisma.student.count.mockResolvedValue(3);

      const result = await service.quickSearch('Ali V', ceoCtx);

      // "Ali V" exact or starts-with matches should come first
      expect(result.students.items[0].label).toBe('Ali V');
    });
  });

  describe('fullSearch()', () => {
    it('should return paginated student results with group and balance', async () => {
      prisma.student.findMany.mockResolvedValue([
        {
          id: 10001,
          firstName: 'Ali',
          lastName: 'Karimov',
          phone: '901234567',
          photo: null,
          balance: -30000,
          enrollments: [
            {
              group: {
                name: 'A1-Gruppe',
                teachers: [
                  { teacher: { firstName: 'Anna', lastName: 'Schmidt' } },
                ],
              },
            },
          ],
        },
      ]);
      prisma.student.count.mockResolvedValue(1);

      const result = await service.fullSearch('ali', ceoCtx, 'students', 1, 10);

      expect(result).toEqual({
        data: [
          {
            id: 10001,
            label: 'Ali Karimov',
            phone: '901234567',
            photo: null,
            groupName: 'A1-Gruppe',
            teacherName: 'Anna Schmidt',
            balance: -30000,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });

    it('should handle pagination offset correctly', async () => {
      prisma.group.findMany.mockResolvedValue([]);
      prisma.group.count.mockResolvedValue(0);

      await service.fullSearch('test', ceoCtx, 'groups', 3, 20);

      expect(prisma.group.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 40,
          take: 20,
        }),
      );
    });

    it('should return user roles as sublabel', async () => {
      prisma.user.findMany.mockResolvedValue([
        {
          id: 10002,
          firstName: 'Admin',
          lastName: 'User',
          phone: '901111111',
          photo: null,
          roles: [
            { role: { name: 'CEO' } },
            { role: { name: 'Administrator' } },
          ],
        },
      ]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.fullSearch('admin', ceoCtx, 'users', 1, 10);

      expect(result.data[0].sublabel).toBe('CEO, Administrator');
    });

    it('should filter by companyId in full search', async () => {
      prisma.student.findMany.mockResolvedValue([]);
      prisma.student.count.mockResolvedValue(0);

      await service.fullSearch('test', ceoCtx, 'students', 1, 10);

      expect(prisma.student.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            companyId: 1,
          }),
        }),
      );
    });
  });
});
