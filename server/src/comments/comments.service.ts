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
import { CommentQueryDto, LatestCommentQueryDto } from './dto/comment-query.dto';

const commentInclude = {
  author: { select: { id: true, name: true, photo: true } },
  assignees: {
    include: { user: { select: { id: true, name: true } } },
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

    const comment = await this.prisma.comment.create({
      data: {
        entityType: dto.entityType,
        entityId: String(dto.entityId),
        content: dto.content,
        isTask: dto.isTask ?? false,
        authorId: userId,
        companyId,
        assignees: dto.isTask && dto.assigneeIds
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

  async findByEntity(query: CommentQueryDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const where = {
      entityType: query.entityType,
      entityId: String(query.entityId),
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

  async getLatestComment(query: LatestCommentQueryDto) {
    const comment = await this.prisma.comment.findFirst({
      where: {
        entityType: query.entityType,
        entityId: String(query.entityId),
      },
      include: commentInclude,
      orderBy: { createdAt: 'desc' },
    });

    return comment;
  }

  async update(id: string, dto: UpdateCommentDto, userId: number, roles: string[]) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
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

    const updated = await this.prisma.comment.update({
      where: { id },
      data: { content: dto.content },
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

    return updated;
  }

  async delete(id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: commentInclude,
    });

    if (!comment) {
      throw new NotFoundException('Izoh topilmadi');
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

  async updateAssigneeStatus(
    commentId: string,
    userId: number,
    status: AssigneeStatus,
  ) {
    const assignee = await this.prisma.commentAssignee.findFirst({
      where: { commentId, userId },
      include: {
        comment: {
          include: { author: { select: { id: true, name: true } } },
        },
      },
    });

    if (!assignee) {
      throw new NotFoundException('Sizga bu topshiriq berilmagan');
    }

    if (
      assignee.status === AssigneeStatus.DONE ||
      (assignee.status === AssigneeStatus.SEEN &&
        status === AssigneeStatus.PENDING)
    ) {
      throw new BadRequestException("Bu status o'tkazib bo'lmaydi");
    }

    const updateData: any = { status };
    if (status === AssigneeStatus.SEEN) updateData.seenAt = new Date();
    if (status === AssigneeStatus.DONE) {
      updateData.doneAt = new Date();
      if (!assignee.seenAt) updateData.seenAt = new Date();
    }

    const updated = await this.prisma.commentAssignee.update({
      where: { id: assignee.id },
      data: updateData,
      include: { user: { select: { id: true, name: true } } },
    });

    this.eventEmitter.emit('task.status.changed', {
      comment: assignee.comment,
      assignee: updated,
      newStatus: status,
    });

    return updated;
  }
}
