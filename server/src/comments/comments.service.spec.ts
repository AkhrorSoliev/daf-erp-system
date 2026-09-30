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
  entityType: 'Student' as const,
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
  // The entity guard needs a caller; a CEO spans every branch.
  const CEO_ID = 1;
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
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      // «Dars bo'ldimi?» system tasks (ADR-0054): the status change runs in a
      // transaction that also reads and updates the lesson the task belongs to.
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
      unmarkedLesson: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
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
        // Assignees are checked against the company now. The fixtures use one
        // assignee, so one match is the passing answer.
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
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
            isTask: false,
            authorId: 1,
            companyId: 1001,
          }),
        }),
      );
      expect(entityHistoryService.recordCreate).toHaveBeenCalled();
      // A plain comment emits NOTHING. This used to assert a
      // `comment.created` event, which was emitted and never listened for —
      // the test pinned a line that did nothing, and passing proved only that
      // the line was still there. The event a comment can actually trigger is
      // `task.assigned`, and only when it is a task with assignees.
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(result).toEqual(mockComment);
    });

    it('should create a task comment with assignees', async () => {
      prisma.comment.create.mockResolvedValue(mockTaskComment);

      const dto = {
        entityType: 'Student' as const,
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
        entityType: 'Student' as const,
        entityId: '10001',
        content: 'Test',
        isTask: true,
        assigneeIds: [],
      };

      await expect(service.create(dto, 1, 1001)).rejects.toThrow(
        BadRequestException,
      );
    });

    // DueDate must fall inside Asia/Tashkent working window:
    // Monday–Saturday, 08:00–18:00 inclusive. Sundays and off-hours are
    // rejected so every task is guaranteed a TaskReminder cron tick.
    describe('dueDate working-window validation', () => {
      function taskDto(dueDate: string) {
        return {
          entityType: 'Student' as const,
          entityId: '10001',
          content: 'Call back',
          isTask: true,
          assigneeIds: [10001],
          dueDate,
        };
      }

      it('accepts dueDate at 08:00 Tashkent on a Monday', async () => {
        // Monday 2026-06-01 08:00 Tashkent = 03:00 UTC
        await expect(
          service.create(taskDto('2026-06-01T03:00:00.000Z'), 1, 1001),
        ).resolves.toBeDefined();
      });

      it('accepts dueDate at 18:00 Tashkent on a Saturday', async () => {
        // Saturday 2026-06-06 18:00 Tashkent = 13:00 UTC
        await expect(
          service.create(taskDto('2026-06-06T13:00:00.000Z'), 1, 1001),
        ).resolves.toBeDefined();
      });

      it('rejects dueDate on Sunday', async () => {
        // Sunday 2026-06-07 10:00 Tashkent = 05:00 UTC
        await expect(
          service.create(taskDto('2026-06-07T05:00:00.000Z'), 1, 1001),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects dueDate before 08:00 Tashkent', async () => {
        // Monday 2026-06-01 07:30 Tashkent = 02:30 UTC
        await expect(
          service.create(taskDto('2026-06-01T02:30:00.000Z'), 1, 1001),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects dueDate after 18:00 Tashkent', async () => {
        // Monday 2026-06-01 18:30 Tashkent = 13:30 UTC
        await expect(
          service.create(taskDto('2026-06-01T13:30:00.000Z'), 1, 1001),
        ).rejects.toThrow(BadRequestException);
      });

      it('rejects dueDate at midnight (00:00) — off-hours', async () => {
        // Monday 2026-06-01 00:00 Tashkent = Sunday 2026-05-31 19:00 UTC
        await expect(
          service.create(taskDto('2026-05-31T19:00:00.000Z'), 1, 1001),
        ).rejects.toThrow(BadRequestException);
      });

      it('does NOT validate when isTask=false (regular comments unaffected)', async () => {
        // Sunday with a dueDate — but isTask is false, so the field is ignored
        await expect(
          service.create(
            {
              entityType: 'Student' as const,
              entityId: '10001',
              content: 'Just a note',
              isTask: false,
              dueDate: '2026-06-07T05:00:00.000Z',
            },
            1,
            1001,
          ),
        ).resolves.toBeDefined();
      });
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
        entityType: 'Student' as const,
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

      await service.updateAssigneeStatus(
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

  describe('system tasks (ADR-0054)', () => {
    const systemComment = {
      id: 'c1',
      isTask: true,
      isSystem: true,
      authorId: null,
      author: null,
      companyId: 1,
      entityType: 'Group',
      entityId: 'g1',
      content: 'x',
      assignees: [],
    };

    it('cannot be edited or deleted', async () => {
      prisma.comment.findFirst.mockResolvedValue(systemComment);
      await expect(
        service.update('c1', { content: 'y' } as any, 1, ['CEO'], 1),
      ).rejects.toThrow("Tizim bergan topshiriqni tahrirlab bo'lmaydi");
      await expect(service.delete('c1', 1)).rejects.toThrow(
        "Tizim bergan topshiriqni o'chirib bo'lmaydi",
      );
    });

    it('closes only by answering the lesson', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({
        id: 'a3',
        status: 'PENDING',
        seenAt: null,
        comment: systemComment,
      });
      await expect(
        service.updateAssigneeStatus('c1', 3, 'DONE' as any),
      ).rejects.toThrow("darsga javob berilganda o'zi yopiladi");
    });

    it('is taken by the first administrator to mark it seen', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({
        id: 'a3',
        status: 'PENDING',
        seenAt: null,
        comment: systemComment,
      });
      prisma.commentAssignee.findMany.mockResolvedValue([
        { userId: 3 },
        { userId: 4 },
      ]);
      prisma.commentAssignee.update.mockResolvedValue({
        id: 'a3',
        status: 'SEEN',
        user: { id: 3 },
      });
      await service.updateAssigneeStatus('c1', 3, 'SEEN' as any);
      expect(prisma.commentAssignee.deleteMany).toHaveBeenCalledWith({
        where: { commentId: 'c1', userId: { not: 3 } },
      });
      expect(prisma.unmarkedLesson.updateMany).toHaveBeenCalledWith({
        where: { taskCommentId: 'c1' },
        data: { claimedById: 3 },
      });
    });

    it('tells the second administrator who took it', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue(null);
      prisma.unmarkedLesson.findFirst.mockResolvedValue({ claimedById: 3 });
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Ali',
        lastName: 'Valiyev',
      });
      await expect(
        service.updateAssigneeStatus('c1', 4, 'SEEN' as any),
      ).rejects.toThrow('Bu topshiriqni Ali Valiyev oldi');
    });

    it('turns a Serializable conflict into a 409', async () => {
      prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
      await expect(
        service.updateAssigneeStatus('c1', 3, 'SEEN' as any),
      ).rejects.toThrow("Topshiriq hozirgina o'zgardi. Sahifani yangilang");
    });

    it('turns a Postgres deadlock into the same 409', async () => {
      // The exact object @prisma/adapter-pg produces for SQLSTATE 40P01: it
      // maps only 40001 to P2034, so a deadlock reaches the caller as a raw
      // DriverAdapterError with the SQLSTATE on `cause` and no `code` of its
      // own (captured from a real deadlock between two interactive
      // transactions).
      const deadlock = Object.assign(new Error('deadlock detected'), {
        name: 'DriverAdapterError',
        cause: {
          originalCode: '40P01',
          originalMessage: 'deadlock detected',
          kind: 'postgres',
          code: '40P01',
          severity: 'ERROR',
          message: 'deadlock detected',
        },
      });
      prisma.$transaction.mockRejectedValueOnce(deadlock);
      await expect(
        service.updateAssigneeStatus('c1', 3, 'SEEN' as any),
      ).rejects.toThrow("Topshiriq hozirgina o'zgardi. Sahifani yangilang");
    });

    it('does not swallow other database errors', async () => {
      const boom = Object.assign(new Error('connection lost'), {
        name: 'DriverAdapterError',
        cause: { kind: 'postgres', code: '08006' },
      });
      prisma.$transaction.mockRejectedValueOnce(boom);
      await expect(
        service.updateAssigneeStatus('c1', 3, 'SEEN' as any),
      ).rejects.toBe(boom);
    });

    it('keeps an answered system task closed', async () => {
      prisma.commentAssignee.findFirst.mockResolvedValue({
        id: 'a3',
        status: 'DONE',
        seenAt: new Date(),
        comment: systemComment,
      });
      for (const status of ['SEEN', 'PENDING']) {
        await expect(
          service.updateAssigneeStatus('c1', 3, status as any),
        ).rejects.toThrow("darsga javob berilganda o'zi yopiladi");
      }
      expect(prisma.commentAssignee.update).not.toHaveBeenCalled();
      expect(prisma.commentAssignee.deleteMany).not.toHaveBeenCalled();
    });

    it("carries the lesson's question in getMyTasks", async () => {
      prisma.commentAssignee.findMany.mockResolvedValue([]);
      prisma.commentAssignee.count = jest.fn().mockResolvedValue(0);
      await service.getMyTasks(3, {} as any);
      expect(prisma.commentAssignee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            comment: expect.objectContaining({
              include: expect.objectContaining({
                unmarkedLesson: {
                  select: {
                    id: true,
                    groupId: true,
                    date: true,
                    status: true,
                    teacherPayExempt: true,
                    lessonStartTime: true,
                    lessonEndTime: true,
                    group: { select: { name: true } },
                  },
                },
              }),
            }),
          }),
        }),
      );
    });
  });
});
