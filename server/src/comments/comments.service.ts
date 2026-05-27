import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssigneeStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentQueryDto,
  LatestCommentQueryDto,
} from './dto/comment-query.dto';
import { TaskQueryDto } from './dto/task-query.dto';

// Asia/Tashkent ish kuni va ish soati cheklovi (08:00 dan 18:00 gacha,
// dushanba–shanba, yakshanba dam). DueDate ushbu deraza tashqarisida
// bo'lishi rad etiladi. Texnik sabab: TaskReminderService cron faqat shu
// oraliqda ishlaydi — boshqa vaqtda berilgan vazifaga 1-soatlik eslatma
// kelmaydi.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18;

function assertDueDateInWorkingWindow(dueDate: string) {
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return; // class-validator already rejects bad date strings
  const tashkent = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const hour = tashkent.getUTCHours();
  const minute = tashkent.getUTCMinutes();
  const dayOfWeek = tashkent.getUTCDay(); // 0=Sunday, 1=Monday, …, 6=Saturday

  if (dayOfWeek === 0) {
    throw new BadRequestException(
      'Vazifa muddati ish kunlarida belgilanishi kerak (yakshanba dam olish kuni)',
    );
  }
  if (
    hour < WORK_START_HOUR ||
    hour > WORK_END_HOUR ||
    (hour === WORK_END_HOUR && minute > 0)
  ) {
    throw new BadRequestException(
      'Vazifa muddati ish soati ichida belgilanishi kerak (08:00 dan 18:00 gacha, Toshkent vaqti)',
    );
  }
}

const commentInclude = {
  author: {
    select: { id: true, firstName: true, lastName: true, photo: true },
  },
  assignees: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateCommentDto, userId: number, companyId: number) {
    if (dto.isTask && (!dto.assigneeIds || dto.assigneeIds.length === 0)) {
      throw new BadRequestException(
        "Topshiriq uchun kamida bitta mas'ul shaxs tanlang",
      );
    }

    if (dto.isTask && dto.dueDate) {
      assertDueDateInWorkingWindow(dto.dueDate);
    }

    const comment = await this.prisma.comment.create({
      data: {
        entityType: dto.entityType,
        entityId: String(dto.entityId),
        content: dto.content,
        isTask: dto.isTask ?? false,
        dueDate: dto.isTask && dto.dueDate ? new Date(dto.dueDate) : null,
        priority: dto.isTask && dto.priority ? dto.priority : null,
        authorId: userId,
        companyId,
        assignees:
          dto.isTask && dto.assigneeIds
            ? {
                create: dto.assigneeIds.map((id) => ({
                  userId: id,
                  status: AssigneeStatus.PENDING,
                })),
              }
            : undefined,
      },
      include: commentInclude,
    });

    await this.entityHistoryService.recordCreate({
      entityType: dto.entityType,
      entityId: dto.entityId,
      newValues: {
        commentId: comment.id,
        content: comment.content,
        isTask: comment.isTask,
        action: 'COMMENT_ADDED',
      },
      changedById: userId,
      companyId,
    });

    this.eventEmitter.emit('comment.created', { comment });

    if (dto.isTask && dto.assigneeIds) {
      this.eventEmitter.emit('task.assigned', {
        comment,
        assigneeIds: dto.assigneeIds,
      });
    }

    return comment;
  }

  async findByEntity(query: CommentQueryDto, companyId: number) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where = {
      entityType: query.entityType,
      entityId: String(query.entityId),
      companyId,
    };

    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: commentInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async getLatestComment(query: LatestCommentQueryDto, companyId: number) {
    const comment = await this.prisma.comment.findFirst({
      where: {
        entityType: query.entityType,
        entityId: String(query.entityId),
        companyId,
      },
      include: commentInclude,
      orderBy: { createdAt: 'desc' },
    });

    return comment;
  }

  async update(
    id: string,
    dto: UpdateCommentDto,
    userId: number,
    roles: string[],
    companyId: number,
  ) {
    const comment = await this.prisma.comment.findFirst({
      where: { id, companyId },
      include: commentInclude,
    });

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    const isCeo = roles.includes('CEO');
    if (comment.authorId !== userId && !isCeo) {
      throw new ForbiddenException(
        'Faqat muallif yoki CEO izohni tahrirlay oladi',
      );
    }

    const updateData: any = {};
    if (dto.content !== undefined) updateData.content = dto.content;
    if (dto.dueDate !== undefined) {
      if (dto.dueDate && comment.isTask) {
        assertDueDateInWorkingWindow(dto.dueDate);
      }
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.priority !== undefined) updateData.priority = dto.priority || null;

    const updated = await this.prisma.comment.update({
      where: { id },
      data: updateData,
      include: commentInclude,
    });

    await this.entityHistoryService.recordUpdate({
      entityType: comment.entityType,
      entityId: comment.entityId,
      oldValues: { commentId: comment.id, content: comment.content },
      newValues: { commentId: updated.id, content: updated.content },
      changedById: userId,
      companyId: comment.companyId,
    });

    // Topshiriq yangilanganda assignee larga xabar berish
    if (comment.isTask && comment.assignees.length > 0) {
      this.eventEmitter.emit('task.updated', {
        comment: updated,
        assigneeIds: comment.assignees.map((a: any) => a.userId),
      });
    }

    return updated;
  }

  async delete(id: string, companyId: number) {
    const comment = await this.prisma.comment.findFirst({
      where: { id, companyId },
      include: commentInclude,
    });

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
    }

    // Topshiriq o'chirilganda assignee larga xabar berish
    if (comment.isTask && comment.assignees.length > 0) {
      this.eventEmitter.emit('task.deleted', {
        comment,
        assigneeIds: comment.assignees.map((a: any) => a.userId),
      });
    }

    await this.prisma.comment.delete({ where: { id } });

    await this.entityHistoryService.recordDelete({
      entityType: comment.entityType,
      entityId: comment.entityId,
      oldValues: {
        commentId: comment.id,
        content: comment.content,
        isTask: comment.isTask,
        action: 'COMMENT_DELETED',
      },
      companyId: comment.companyId,
    });

    return { message: "Izoh muvaffaqiyatli o'chirildi" };
  }

  async getMyTasks(userId: number, query: TaskQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const statusFilter = query.status
      ? (query.status.split(',').map((s) => s.trim()) as AssigneeStatus[])
      : undefined;

    const where: any = {
      userId,
      comment: { isTask: true },
    };
    if (statusFilter) where.status = { in: statusFilter };

    const [data, total] = await Promise.all([
      this.prisma.commentAssignee.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true } },
          comment: {
            include: {
              author: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  photo: true,
                },
              },
              assignees: {
                include: {
                  user: {
                    select: { id: true, firstName: true, lastName: true },
                  },
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.commentAssignee.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async getCreatedTasks(userId: number, query: TaskQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 50;
    const skip = (page - 1) * pageSize;

    const where: any = {
      authorId: userId,
      isTask: true,
    };

    if (query.status) {
      const statuses = query.status.split(',').map((s) => s.trim());
      where.assignees = { some: { status: { in: statuses } } };
    }

    const [data, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        include: commentInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async updateAssigneeStatus(
    commentId: string,
    userId: number,
    status: AssigneeStatus,
  ) {
    const assignee = await this.prisma.commentAssignee.findFirst({
      where: { commentId, userId },
      include: {
        comment: {
          include: {
            author: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!assignee) {
      throw new NotFoundException('Sizga bu topshiriq berilmagan');
    }

    if (assignee.status === status) {
      throw new BadRequestException('Status allaqachon belgilangan');
    }

    const updateData: any = { status };
    if (status === AssigneeStatus.PENDING) {
      updateData.seenAt = null;
      updateData.doneAt = null;
    } else if (status === AssigneeStatus.SEEN) {
      updateData.seenAt = new Date();
      updateData.doneAt = null;
    } else if (status === AssigneeStatus.DONE) {
      updateData.doneAt = new Date();
      if (!assignee.seenAt) updateData.seenAt = new Date();
    }

    const updated = await this.prisma.commentAssignee.update({
      where: { id: assignee.id },
      data: updateData,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    this.eventEmitter.emit('task.status.changed', {
      comment: assignee.comment,
      assignee: updated,
      newStatus: status,
    });

    return updated;
  }
}
