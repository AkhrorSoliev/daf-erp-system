import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import { NotificationResolverService } from '../../notifications/notification-resolver.service';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { NotificationsService } from '../../notifications/notifications.service';
import { PushService } from '../../notifications/push.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  REPORT_DUPLICATE_MESSAGE,
  REPORT_SNAPSHOT_SIZE,
} from '../chat.constants';
import { ChatConversationsService } from '../conversations/chat-conversations.service';
import { ChatBanService } from './chat-ban.service';

const LIST_DEFAULT = 20;

@Injectable()
export class ChatReportsService {
  private readonly logger = new Logger(ChatReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly ban: ChatBanService,
    private readonly notifications: NotificationsService,
    private readonly gateway: NotificationsGateway,
    private readonly push: PushService,
    private readonly resolver: NotificationResolverService,
  ) {}

  /**
   * Any member may report, locked or banned too (reading and reporting are
   * never closed). The copy is TEXT: it survives the sender deleting the
   * message and the nightly file purge.
   */
  async create(
    me: number,
    companyId: number,
    dto: { conversationId: string; reason: string },
  ): Promise<{ id: string; status: 'OPEN' }> {
    const { peerId } = await this.conversations.mine(me, dto.conversationId);
    const open = await this.prisma.chatReport.findFirst({
      where: { reporterId: me, reportedId: peerId, status: 'OPEN' },
      select: { id: true },
    });
    if (open) throw new ConflictException(REPORT_DUPLICATE_MESSAGE);

    const latest = await this.prisma.chatMessage.findMany({
      where: { conversationId: dto.conversationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: REPORT_SNAPSHOT_SIZE,
    });
    const snapshot = latest.reverse().map((m) => ({
      id: m.id,
      senderId: m.senderId,
      kind: m.kind,
      text: m.text,
      // The first text of an edited message: an insult cannot be tidied away.
      ...(m.originalText != null && { originalText: m.originalText }),
      hasFile: m.fileKey != null,
      deleted: m.deletedAt != null,
      createdAt: m.createdAt.toISOString(),
    }));
    const row = await this.prisma.chatReport.create({
      data: {
        companyId,
        reporterId: me,
        reportedId: peerId,
        conversationId: dto.conversationId,
        reason: dto.reason,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await this.notifyCeos(companyId, row.id, me, peerId);
    return { id: row.id, status: 'OPEN' };
  }

  /**
   * One bell row (+ SSE + push) per active CEO. Names only: never the reason or
   * a message. Best effort — a failing notice must never fail the saved report.
   */
  private async notifyCeos(
    companyId: number,
    reportId: string,
    reporterId: number,
    reportedId: number,
  ): Promise<void> {
    try {
      const [ceos, names] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            companyId,
            deletedAt: null,
            isActive: true,
            status: UserStatus.ACTIVE,
            roles: { some: { role: { name: 'CEO' } } },
          },
          select: { id: true },
        }),
        this.names([reporterId, reportedId]),
      ]);
      const title = 'Yangi chat shikoyati';
      const message = `${this.person(names, reporterId).name} ${this.person(names, reportedId).name} haqida shikoyat qildi`;
      for (const ceo of ceos) {
        try {
          const notification = await this.notifications.create({
            userId: ceo.id,
            type: 'CHAT_REPORT',
            title,
            message,
            relatedEntityType: 'ChatReport',
            relatedEntityId: reportId,
            companyId,
          });
          this.gateway.sendToUser(ceo.id, {
            type: 'notification',
            notification,
          });
          await this.push.sendToUser(ceo.id, {
            title,
            body: message,
            url: `/settings/chat?tab=shikoyatlar&shikoyat=${reportId}`,
          });
        } catch (err) {
          this.warn(ceo.id, err);
        }
      }
    } catch (err) {
      this.logger.warn(
        `report notice: loading the CEOs failed: ${(err as Error).message}`,
      );
    }
  }

  private warn(userId: number, err: unknown) {
    this.logger.warn(
      `report notice for user ${userId} failed: ${(err as Error).message}`,
    );
  }

  private async names(ids: number[]) {
    const rows = await this.prisma.student.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        chatBannedAt: true,
      },
    });
    return new Map(rows.map((s) => [s.id, s]));
  }

  private person(
    map: Map<
      number,
      {
        id: number;
        firstName: string;
        lastName: string;
        username: string | null;
        chatBannedAt: Date | null;
      }
    >,
    id: number,
  ) {
    const s = map.get(id);
    return {
      id,
      name: s ? `${s.firstName} ${s.lastName}`.trim() : "O'chirilgan o'quvchi",
      username: s?.username ?? null,
      chatBannedAt: s?.chatBannedAt?.toISOString() ?? null,
    };
  }

  async list(
    companyId: number,
    q: {
      status?: 'OPEN' | 'RESOLVED' | 'DISMISSED';
      cursor?: string;
      limit?: number;
    },
  ) {
    const limit = q.limit ?? LIST_DEFAULT;
    const rows = await this.prisma.chatReport.findMany({
      where: { companyId, ...(q.status && { status: q.status }) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor && { cursor: { id: q.cursor }, skip: 1 }),
      select: {
        id: true,
        status: true,
        reason: true,
        createdAt: true,
        reporterId: true,
        reportedId: true,
        conversationId: true,
      },
    });
    const page = rows.slice(0, limit);
    const names = await this.names(
      page.flatMap((r) => [r.reporterId, r.reportedId]),
    );
    return {
      data: page.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt.toISOString(),
        conversationId: r.conversationId,
        reporter: this.person(names, r.reporterId),
        reported: this.person(names, r.reportedId),
      })),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  async get(companyId: number, id: string) {
    const r = await this.prisma.chatReport.findUnique({ where: { id } });
    if (!r || r.companyId !== companyId) {
      throw new NotFoundException('Shikoyat topilmadi');
    }
    const names = await this.names([r.reporterId, r.reportedId]);
    return {
      id: r.id,
      status: r.status,
      reason: r.reason,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolutionNote: r.resolutionNote,
      conversationId: r.conversationId,
      reporter: this.person(names, r.reporterId),
      reported: this.person(names, r.reportedId),
      snapshot: r.snapshot,
    };
  }

  async resolve(
    companyId: number,
    actorId: number,
    id: string,
    dto: {
      outcome: 'RESOLVED' | 'DISMISSED';
      note?: string;
      banReported?: boolean;
    },
  ) {
    const r = await this.prisma.chatReport.findUnique({ where: { id } });
    if (!r || r.companyId !== companyId) {
      throw new NotFoundException('Shikoyat topilmadi');
    }
    if (r.status !== 'OPEN') {
      throw new ConflictException("Shikoyat allaqachon ko'rib chiqilgan");
    }
    // Ban first (idempotent): a failing ban leaves the report OPEN for a retry.
    if (dto.banReported) await this.ban.ban(r.reportedId, companyId, actorId);
    const { count } = await this.prisma.chatReport.updateMany({
      where: { id, companyId, status: 'OPEN' },
      data: {
        status: dto.outcome,
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolutionNote: dto.note ?? null,
      },
    });
    if (count === 0) {
      throw new ConflictException("Shikoyat allaqachon ko'rib chiqilgan");
    }
    // Close the CEOs' bell rows (never throws; tells their open bells).
    await this.resolver.resolve({
      companyId,
      type: 'CHAT_REPORT',
      relatedEntityType: 'ChatReport',
      relatedEntityId: id,
    });
    return this.get(companyId, id);
  }
}
