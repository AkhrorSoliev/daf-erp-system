import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

const mockComment = {
  id: 'comment-uuid-1',
  entityType: 'Student' as const,
  entityId: '10001',
  content: "Bu talaba hujjatlari to'liq emas",
  isTask: false,
  authorId: 1,
  companyId: 1001,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 1, name: 'CEO', photo: null },
};

describe('CommentsService', () => {
  // The entity guard needs a caller; a CEO spans every branch.
  const CEO_ID = 1;
  let service: CommentsService;
  let prisma: any;
  let entityHistoryService: any;

  beforeEach(async () => {
    prisma = {
      comment: {
        create: jest.fn().mockResolvedValue(mockComment),
        findMany: jest.fn().mockResolvedValue([mockComment]),
        findFirst: jest.fn().mockResolvedValue(mockComment),
        findUnique: jest.fn().mockResolvedValue(mockComment),
        count: jest.fn().mockResolvedValue(1),
        delete: jest.fn().mockResolvedValue(mockComment),
      },
      // The entity guard resolves the commented-on record's branch. These
      // fixtures put the entity and the caller in the same branch — the case
      // under test here is the comment logic, not the confinement, which has
      // its own spec.
      student: { findFirst: jest.fn().mockResolvedValue({ id: 10001 }) },
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      enrollment: { findFirst: jest.fn().mockResolvedValue(null) },
      group: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      groupTeacher: { findUnique: jest.fn().mockResolvedValue(null) },
      lead: { findFirst: jest.fn().mockResolvedValue({ branchId: 1 }) },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 1,
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  describe('create', () => {
    it('should create a regular comment', async () => {
      const dto = {
        entityType: 'Student' as const,
        entityId: '10001',
        content: 'Test izoh',
      };

      const result = await service.create(dto, 1, 1001);

      expect(prisma.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: 'Student' as const,
            entityId: '10001',
            content: 'Test izoh',
            authorId: 1,
            companyId: 1001,
          }),
        }),
      );
      expect(entityHistoryService.recordCreate).toHaveBeenCalled();
      expect(result).toEqual(mockComment);
    });

    it('never writes a task — task fields are not part of a comment', async () => {
      await service.create(
        { entityType: 'Student' as const, entityId: '10001', content: 'x' },
        1,
        1001,
      );
      const data = prisma.comment.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('isTask');
      expect(data).not.toHaveProperty('assignees');
      expect(data).not.toHaveProperty('dueDate');
    });
  });

  describe('findByEntity', () => {
    it('should return paginated comments', async () => {
      const result = await service.findByEntity(
        {
          entityType: 'Student' as const,
          entityId: '10001',
          page: 1,
          pageSize: 20,
        },
        1001,
        CEO_ID,
        ['CEO'],
      );

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: 'Student' as const,
            entityId: '10001',
            companyId: 1001,
            isTask: false,
          },
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(result).toEqual({
        data: [mockComment],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });
  });

  describe('getLatestComment', () => {
    it('should return the latest comment', async () => {
      const result = await service.getLatestComment(
        {
          entityType: 'Student' as const,
          entityId: '10001',
        },
        1001,
        CEO_ID,
        ['CEO'],
      );

      expect(prisma.comment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: 'Student' as const,
            entityId: '10001',
            companyId: 1001,
            isTask: false,
          },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual(mockComment);
    });

    it('should return null when no comments exist', async () => {
      prisma.comment.findFirst.mockResolvedValue(null);

      const result = await service.getLatestComment(
        {
          entityType: 'Student' as const,
          entityId: '99999',
        },
        1001,
        CEO_ID,
        ['CEO'],
      );

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('should allow author to update their own comment', async () => {
      prisma.comment.findFirst.mockResolvedValue(mockComment);
      prisma.comment.update = jest.fn().mockResolvedValue({
        ...mockComment,
        content: 'Yangilangan izoh',
      });

      const result = await service.update(
        'comment-uuid-1',
        { content: 'Yangilangan izoh' },
        1, // authorId matches
        ['Administrator'],
        1001,
      );

      expect(prisma.comment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comment-uuid-1' },
          data: { content: 'Yangilangan izoh' },
        }),
      );
      expect(entityHistoryService.recordUpdate).toHaveBeenCalled();
      expect(result.content).toBe('Yangilangan izoh');
    });

    it('should allow CEO to update any comment', async () => {
      prisma.comment.findFirst.mockResolvedValue({
        ...mockComment,
        authorId: 999,
      });
      prisma.comment.update = jest.fn().mockResolvedValue({
        ...mockComment,
        authorId: 999,
        content: 'CEO tahrir qildi',
      });

      const result = await service.update(
        'comment-uuid-1',
        { content: 'CEO tahrir qildi' },
        1,
        ['CEO'],
        1001,
      );

      expect(result.content).toBe('CEO tahrir qildi');
    });

    it('should throw if non-author non-CEO tries to update', async () => {
      prisma.comment.findFirst.mockResolvedValue({
        ...mockComment,
        authorId: 999,
      });

      await expect(
        service.update(
          'comment-uuid-1',
          { content: 'test' },
          10001,
          ['Administrator'],
          1001,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw if comment not found', async () => {
      prisma.comment.findFirst.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { content: 'test' }, 1, ['CEO'], 1001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should hard delete a comment', async () => {
      const result = await service.delete('comment-uuid-1', 1001);

      expect(prisma.comment.delete).toHaveBeenCalledWith({
        where: { id: 'comment-uuid-1' },
      });
      expect(entityHistoryService.recordDelete).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({ message: expect.any(String) }),
      );
    });

    it('should throw if comment not found', async () => {
      prisma.comment.findFirst.mockResolvedValue(null);

      await expect(service.delete('nonexistent', 1001)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
