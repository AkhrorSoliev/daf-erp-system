import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ChatConversationsService,
    private readonly ban: ChatBanService,
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
    return { id: row.id, status: 'OPEN' };
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
    if (dto.banReported) await this.ban.ban(r.reportedId, companyId, actorId);
    return this.get(companyId, id);
  }
}
