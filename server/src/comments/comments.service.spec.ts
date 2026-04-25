import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssigneeStatus } from '@prisma/client';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';

const mockComment = {
  id: 'comment-uuid-1',
  entityType: 'Student',
  entityId: '10001',
  content: "Bu talaba hujjatlari to'liq emas",
  isTask: false,
  authorId: 1,
  companyId: 1001,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 1, name: 'CEO', photo: null },
  assignees: [],
};

const mockTaskComment = {
  ...mockComment,
  id: 'comment-uuid-2',
  isTask: true,
  assignees: [
    {
      id: 'assignee-uuid-1',
      commentId: 'comment-uuid-2',
      userId: 10001,
      user: { id: 10001, name: 'Admin 1' },
      status: AssigneeStatus.PENDING,
      seenAt: null,
      doneAt: null,
      createdAt: new Date(),
    },
  ],
};

describe('CommentsService', () => {
  let service: CommentsService;
  let prisma: any;
  let entityHistoryService: any;
  let eventEmitter: any;

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
      commentAssignee: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: entityHistoryService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  describe('create', () => {
    it('should create a regular comment', async () => {
      const dto = {
        entityType: 'Student',
        entityId: '10001',
        content: 'Test izoh',
      };

      const result = await service.create(dto, 1, 1001);

      expect(prisma.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            entityType: 'Student',
            entityId: '10001',
            content: 'Test izoh',
            isTask: false,
            authorId: 1,
            companyId: 1001,
          }),
        }),
      );
      expect(entityHistoryService.recordCreate).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'comment.created',
        expect.any(Object),
      );
      expect(result).toEqual(mockComment);
    });

    it('should create a task comment with assignees', async () => {
      prisma.comment.create.mockResolvedValue(mockTaskComment);

      const dto = {
        entityType: 'Student',
        entityId: '10001',
        content: 'Hujjatlarni tekshiring',
        isTask: true,
        assigneeIds: [10001],
      };

      await service.create(dto, 1, 1001);

      expect(prisma.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isTask: true,
            assignees: expect.objectContaining({
              create: expect.arrayContaining([
                expect.objectContaining({
                  userId: 10001,
                  status: AssigneeStatus.PENDING,
                }),
              ]),
            }),
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.assigned',
        expect.objectContaining({
          assigneeIds: [10001],
        }),
      );
    });

    it('should throw if task has no assignees', async () => {
      const dto = {
        entityType: 'Student',
        entityId: '10001',
        content: 'Test',
        isTask: true,
        assigneeIds: [],
      };

      await expect(service.create(dto, 1, 1001)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findByEntity', () => {
    it('should return paginated comments', async () => {
      const result = await service.findByEntity(
        {
          entityType: 'Student',
          entityId: '10001',
          page: 1,
          pageSize: 20,
        },
        1001,
      );

      expect(prisma.comment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Student', entityId: '10001', companyId: 1001 },
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
          entityType: 'Student',
          entityId: '10001',
        },
        1001,
      );

      expect(prisma.comment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { entityType: 'Student', entityId: '10001', companyId: 1001 },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(result).toEqual(mockComment);
    });

    it('should return null when no comments exist', async () => {
      prisma.comment.findFirst.mockResolvedValue(null);

      const result = await service.getLatestComment(
        {
          entityType: 'Student',
          entityId: '99999',
        },
        1001,
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

  describe('updateAssigneeStatus', () => {
    const mockAssignee = {
      id: 'assignee-uuid-1',
      commentId: 'comment-uuid-2',
      userId: 10001,
      status: AssigneeStatus.PENDING,
      seenAt: null,
      doneAt: null,
      comment: {
        id: 'comment-uuid-2',
        content: 'Test task',
        authorId: 1,
        entityType: 'Student',
        entityId: '10001',
        companyId: 1001,
        author: { id: 1, name: 'CEO' },
      },
    };

    it('should update status from PENDING to SEEN', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue(mockAssignee);
      prisma.commentAssignee.update.mockResolvedValue({
        ...mockAssignee,
        status: AssigneeStatus.SEEN,
        seenAt: new Date(),
        user: { id: 10001, name: 'Admin 1' },
      });

      const result = await service.updateAssigneeStatus(
        'comment-uuid-2',
        10001,
        AssigneeStatus.SEEN,
      );

      expect(prisma.commentAssignee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssigneeStatus.SEEN,
            seenAt: expect.any(Date),
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'task.status.changed',
        expect.any(Object),
      );
      expect(result.status).toBe(AssigneeStatus.SEEN);
    });

    it('should update status from PENDING to DONE (auto-sets seenAt)', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue(mockAssignee);
      prisma.commentAssignee.update.mockResolvedValue({
        ...mockAssignee,
        status: AssigneeStatus.DONE,
        seenAt: new Date(),
        doneAt: new Date(),
        user: { id: 10001, name: 'Admin 1' },
      });

      await service.updateAssigneeStatus(
        'comment-uuid-2',
        10001,
        AssigneeStatus.DONE,
      );

      expect(prisma.commentAssignee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssigneeStatus.DONE,
            doneAt: expect.any(Date),
            seenAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw if user is not assigned to the comment', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue(null);

      await expect(
        service.updateAssigneeStatus(
          'comment-uuid-2',
          99999,
          AssigneeStatus.SEEN,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if status is the same', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({
        ...mockAssignee,
        status: AssigneeStatus.SEEN,
      });

      await expect(
        service.updateAssigneeStatus(
          'comment-uuid-2',
          10001,
          AssigneeStatus.SEEN,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow moving from DONE back to SEEN', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({
        ...mockAssignee,
        status: AssigneeStatus.DONE,
        seenAt: new Date(),
        doneAt: new Date(),
      });
      prisma.commentAssignee.update.mockResolvedValue({
        ...mockAssignee,
        status: AssigneeStatus.SEEN,
        seenAt: expect.any(Date),
        doneAt: null,
        user: { id: 10001, name: 'Admin 1' },
      });

      const result = await service.updateAssigneeStatus(
        'comment-uuid-2',
        10001,
        AssigneeStatus.SEEN,
      );

      expect(prisma.commentAssignee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssigneeStatus.SEEN,
            seenAt: expect.any(Date),
            doneAt: null,
          }),
        }),
      );
    });

    it('should allow moving from SEEN back to PENDING', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({
        ...mockAssignee,
        status: AssigneeStatus.SEEN,
        seenAt: new Date(),
      });
      prisma.commentAssignee.update.mockResolvedValue({
        ...mockAssignee,
        status: AssigneeStatus.PENDING,
        seenAt: null,
        doneAt: null,
        user: { id: 10001, name: 'Admin 1' },
      });

      await service.updateAssigneeStatus(
        'comment-uuid-2',
        10001,
        AssigneeStatus.PENDING,
      );

      expect(prisma.commentAssignee.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: AssigneeStatus.PENDING,
            seenAt: null,
            doneAt: null,
          }),
        }),
      );
    });
  });
});
