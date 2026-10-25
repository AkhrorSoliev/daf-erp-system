import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { hit } from '../../students/shared/phone-code';
import { NotificationsGateway } from '../../notifications/notifications.gateway';
import { ChatAccessService } from '../access/chat-access.service';
import {
  I_BLOCKED_MESSAGE,
  OPEN_PER_MINUTE,
  RATE_MESSAGE,
  RATE_PER_MINUTE,
  RESTRICTED_MESSAGE,
} from '../chat.constants';
import { mayWrite } from '../people/chat-people.rules';
import {
  ChatPeopleService,
  type PeerSummary,
} from '../people/chat-people.service';
import type { OpenConversationDto } from '../dto/chat.dto';

export interface MessageView {
  id: string;
  senderId: number;
  mine: boolean;
  kind: 'TEXT' | 'IMAGE' | 'VOICE';
  text: string | null;
  createdAt: string;
}

export interface ConversationView {
  id: string;
  peer: PeerSummary;
  lastMessage: { preview: string; at: string; mine: boolean } | null;
  unread: number;
}

/** A per-student, per-minute counter; replaced by a fake in tests. */
export interface RateLimiter {
  hit(key: string, ttlSec: number): Promise<number>;
}
export const CHAT_RATE_LIMITER = Symbol('CHAT_RATE_LIMITER');

// Deliberately fail-closed: if Redis is down `hit` throws and sends fail with a 500,
// rather than letting messages through unmetered.
export function redisRateLimiter(redis: RedisService): RateLimiter {
  return { hit: (key, ttl) => hit(redis, key, ttl) };
}

const PAGE = 30;
const pair = (a: number, b: number) =>
  a < b ? { low: a, high: b } : { low: b, high: a };

const PREVIEW: Record<string, string> = {
  IMAGE: 'Rasm',
  VOICE: 'Ovozli xabar',
};

@Injectable()
export class ChatConversationsService {
  private readonly logger = new Logger(ChatConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ChatAccessService,
    private readonly people: ChatPeopleService,
    private readonly gateway: NotificationsGateway,
    @Inject(CHAT_RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  private view(
    m: {
      id: string;
      senderId: number;
      kind: string;
      text: string | null;
      createdAt: Date;
    },
    me: number,
  ): MessageView {
    return {
      id: m.id,
      senderId: m.senderId,
      mine: m.senderId === me,
      kind: m.kind as MessageView['kind'],
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    };
  }

  /** The conversation, or 404 — the same answer for "missing" and "not yours". */
  private async mine(me: number, conversationId: string) {
    const c = await this.prisma.chatConversation.findUnique({
      where: { id: conversationId },
    });
    if (!c || (c.studentLowId !== me && c.studentHighId !== me)) {
      throw new NotFoundException('Suhbat topilmadi');
    }
    return {
      c,
      peerId: c.studentLowId === me ? c.studentHighId : c.studentLowId,
    };
  }

  /** Opens (or finds) the conversation with one student, by id or exact @username. */
  async open(
    me: number,
    companyId: number,
    dto: OpenConversationDto,
  ): Promise<{ id: string }> {
    let peerId = dto.studentId ?? null;
    if (peerId === null && dto.username) {
      peerId =
        (await this.people.findByUsername(companyId, dto.username))?.id ?? null;
    }
    if (peerId === null) throw new NotFoundException("O'quvchi topilmadi");
    if (peerId === me) {
      throw new BadRequestException("O'zingiz bilan suhbat ochib bo'lmaydi");
    }
    const peer = await this.prisma.student.findFirst({
      where: { id: peerId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!peer) throw new NotFoundException("O'quvchi topilmadi");

    const { low, high } = pair(me, peerId);
    const existing = await this.prisma.chatConversation.findFirst({
      where: { studentLowId: low, studentHighId: high },
    });
    if (existing) return { id: existing.id };

    // A new conversation needs the same rights as a message.
    await this.access.assertCanWrite(me, companyId);
    await this.countAgainstLimit(`chat:open:${me}`, OPEN_PER_MINUTE);

    // A raw id must not reveal a student who hid from search, nor one who
    // restricts writing: both answer exactly like a missing student. Only an
    // exact @username (the student's own handle) or a shared group opens the door.
    const byId = dto.studentId != null;
    if (byId) {
      const { whoCanFind } = await this.people.privacyOf(peerId);
      if (
        whoCanFind !== 'EVERYONE' &&
        !(await this.people.sharesGroup(me, peerId))
      ) {
        throw new NotFoundException("O'quvchi topilmadi");
      }
    }
    try {
      await this.assertMayReach(me, peerId);
    } catch (err) {
      if (
        byId &&
        err instanceof ForbiddenException &&
        err.message === RESTRICTED_MESSAGE
      ) {
        throw new NotFoundException("O'quvchi topilmadi");
      }
      throw err;
    }
    const created = await this.prisma.chatConversation.upsert({
      where: {
        studentLowId_studentHighId: { studentLowId: low, studentHighId: high },
      },
      create: { companyId, studentLowId: low, studentHighId: high },
      update: {},
    });
    return { id: created.id };
  }

  /** One counter per student and minute; past `limit` the answer is 429. */
  private async countAgainstLimit(prefix: string, limit: number) {
    const minute = Math.floor(Date.now() / 60_000);
    const n = await this.limiter.hit(`${prefix}:${minute}`, 120);
    if (n > limit) {
      throw new HttpException(RATE_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Block first (never revealed as a block), then the peer's "who can write" setting. */
  private async assertMayReach(me: number, peerId: number) {
    const block = await this.people.isBlockedEitherWay(me, peerId);
    if (block.iBlocked) throw new ForbiddenException(I_BLOCKED_MESSAGE);
    if (block.blockedMe) throw new ForbiddenException(RESTRICTED_MESSAGE);
    const privacy = await this.people.privacyOf(peerId);
    const shares =
      privacy.whoCanWrite === 'GROUPMATES'
        ? await this.people.sharesGroup(me, peerId)
        : false;
    if (!mayWrite(privacy.whoCanWrite, shares)) {
      throw new ForbiddenException(RESTRICTED_MESSAGE);
    }
  }

  /**
   * ponytail: one `count` and one `findFirst` per conversation (≤ 50). Replace
   * with a single grouped query if the list gets slow.
   */
  async list(me: number): Promise<ConversationView[]> {
    const rows = await this.prisma.chatConversation.findMany({
      // A conversation with no message yet stays invisible to its other side.
      where: {
        OR: [{ studentLowId: me }, { studentHighId: me }],
        lastMessageAt: { not: null },
      },
      orderBy: [
        { lastMessageAt: { sort: 'desc', nulls: 'last' } },
        { id: 'asc' },
      ],
      take: 50,
    });
    const items = await Promise.all(
      rows.map(async (c): Promise<ConversationView | null> => {
        try {
          const peerId =
            c.studentLowId === me ? c.studentHighId : c.studentLowId;
          const [peer, last, read] = await Promise.all([
            this.people.peerSummary(me, peerId),
            this.prisma.chatMessage.findFirst({
              where: { conversationId: c.id, deletedAt: null },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            }),
            this.prisma.chatReadState.findUnique({
              where: {
                conversationId_studentId: {
                  conversationId: c.id,
                  studentId: me,
                },
              },
            }),
          ]);
          const unread = await this.prisma.chatMessage.count({
            where: {
              conversationId: c.id,
              senderId: { not: me },
              deletedAt: null,
              ...(read && { createdAt: { gt: read.lastReadAt } }),
            },
          });
          return {
            id: c.id,
            peer,
            lastMessage: last
              ? {
                  preview: last.text ?? PREVIEW[last.kind] ?? '',
                  at: last.createdAt.toISOString(),
                  mine: last.senderId === me,
                }
              : null,
            unread,
          };
        } catch (err) {
          // One unreadable conversation (e.g. a hard-deleted peer) must not blank the inbox.
          this.logger.warn(
            `Chat list skipped conversation ${c.id}: ${
              err instanceof Error ? err.message : 'unknown error'
            }`,
          );
          return null;
        }
      }),
    );
    return items.filter((i): i is ConversationView => i !== null);
  }

  async messages(
    me: number,
    conversationId: string,
    cursor?: string,
    limit: number = PAGE,
  ): Promise<{ data: MessageView[]; nextCursor: string | null }> {
    await this.mine(me, conversationId);
    const rows = await this.prisma.chatMessage.findMany({
      where: { conversationId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    const page = rows.slice(0, limit);
    return {
      data: page.map((m) => this.view(m, me)),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  async send(
    me: number,
    companyId: number,
    conversationId: string,
    text: string,
  ): Promise<MessageView> {
    await this.access.assertCanWrite(me, companyId);
    const { peerId } = await this.mine(me, conversationId);
    await this.assertMayReach(me, peerId);

    await this.countAgainstLimit(`chat:rate:${me}`, RATE_PER_MINUTE);

    const row = await this.prisma.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({
        data: { conversationId, senderId: me, kind: 'TEXT', text },
      });
      await tx.chatConversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: m.createdAt },
      });
      // Writing means having read everything so far.
      await tx.chatReadState.upsert({
        where: { conversationId_studentId: { conversationId, studentId: me } },
        create: { conversationId, studentId: me, lastReadAt: m.createdAt },
        update: { lastReadAt: m.createdAt },
      });
      return m;
    });

    await this.pushToPeer(peerId, {
      type: 'chat.message',
      conversationId,
      message: this.view(row, peerId),
    });
    return this.view(row, me);
  }

  async markRead(me: number, conversationId: string): Promise<{ ok: true }> {
    const { peerId } = await this.mine(me, conversationId);
    const readAt = new Date();
    await this.prisma.chatReadState.upsert({
      where: { conversationId_studentId: { conversationId, studentId: me } },
      create: { conversationId, studentId: me, lastReadAt: readAt },
      update: { lastReadAt: readAt },
    });
    await this.pushToPeer(peerId, {
      type: 'chat.read',
      conversationId,
      readAt: readAt.toISOString(),
    });
    return { ok: true };
  }

  async removeOwn(me: number, messageId: string): Promise<{ ok: true }> {
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, senderId: me, deletedAt: null },
    });
    if (!m) throw new NotFoundException('Xabar topilmadi');
    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  /** Live delivery over the existing SSE stream; a student with no account gets nothing. */
  private async pushToPeer(peerId: number, payload: object): Promise<void> {
    // Runs after commit: a failed push must never fail (and invite a retry of) a saved write.
    try {
      const peer = await this.prisma.student.findFirst({
        where: { id: peerId },
        select: { userId: true },
      });
      if (peer?.userId) this.gateway.sendToUser(peer.userId, payload);
    } catch (err) {
      this.logger.warn(
        `Chat live push to student ${peerId} failed: ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  }
}
