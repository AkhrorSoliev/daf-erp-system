import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  CommentQueryDto,
  LatestCommentQueryDto,
} from './dto/comment-query.dto';
import { assertCallerMayTouchCommentEntity } from '../common/auth/comment-entity-scope';

const commentInclude = {
  author: {
    select: { id: true, firstName: true, lastName: true, photo: true },
  },
};

/**
 * Plain notes on a record. Tasks left this service for `src/tasks/`: a comment
 * is never a task any more, and the rows that once were (`isTask: true`) stay
 * in the table for the migration but are hidden from every read here.
 */
@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private entityHistoryService: EntityHistoryService,
  ) {}

  /**
   * A comment thread carries what staff say about a person — a student's
   * payment excuses, a lead's objections, an employee's performance. It is not
   * weaker than the record it hangs off, so it is gated as that record is.
   *
   * Nothing checked the entity at all before: not that it existed, not that it
   * belonged to this company, not that it belonged to this caller's branch.
   * `entityType` was a free string, so the polymorphism had no edge either.
   */
  async create(
    dto: CreateCommentDto,
    userId: number,
    companyId: number,
    roles: string[] = [],
  ) {
    await assertCallerMayTouchCommentEntity(
      this.prisma,
      userId,
      roles,
      dto.entityType,
      dto.entityId,
      companyId,
    );

    const comment = await this.prisma.comment.create({
      data: {
        entityType: dto.entityType,
        entityId: String(dto.entityId),
        content: dto.content,
        authorId: userId,
        companyId,
      },
      include: commentInclude,
    });

    await this.entityHistoryService.recordCreate({
      entityType: dto.entityType,
      entityId: dto.entityId,
      newValues: {
        commentId: comment.id,
        content: comment.content,
        action: 'COMMENT_ADDED',
      },
      changedById: userId,
      companyId,
    });

    // NOTE: no `comment.created` event. One used to be emitted here and
    // nothing has ever listened for it — wildcards are off
    // (`EventEmitterModule.forRoot()` takes no options), so not even a
    // `comment.*` handler would have caught it.
    //
    // `event-wiring.spec.ts` now fails on an emit with no listener.

    return comment;
  }

  async findByEntity(
    query: CommentQueryDto,
    companyId: number,
    userId?: number,
    roles: string[] = [],
  ) {
    await assertCallerMayTouchCommentEntity(
      this.prisma,
      userId,
      roles,
      query.entityType,
      query.entityId,
      companyId,
    );
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    // `isTask: false`: tasks moved to `Task`; migrated rows stay hidden.
    const where = {
      entityType: query.entityType,
      entityId: String(query.entityId),
      companyId,
      isTask: false,
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

  async getLatestComment(
    query: LatestCommentQueryDto,
    companyId: number,
    userId?: number,
    roles: string[] = [],
  ) {
    await assertCallerMayTouchCommentEntity(
      this.prisma,
      userId,
      roles,
      query.entityType,
      query.entityId,
      companyId,
    );
    const comment = await this.prisma.comment.findFirst({
      where: {
        entityType: query.entityType,
        entityId: String(query.entityId),
        companyId,
        isTask: false,
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

    const updateData: { content?: string } = {};
    if (dto.content !== undefined) updateData.content = dto.content;

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

    await this.prisma.comment.delete({ where: { id } });

    await this.entityHistoryService.recordDelete({
      entityType: comment.entityType,
      entityId: comment.entityId,
      oldValues: {
        commentId: comment.id,
        content: comment.content,
        action: 'COMMENT_DELETED',
      },
      companyId: comment.companyId,
    });

    return { message: "Izoh muvaffaqiyatli o'chirildi" };
  }
}
