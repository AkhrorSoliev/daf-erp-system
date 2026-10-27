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
import { Prisma } from '@prisma/client';
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
import { ChatNotifyService } from '../notify/chat-notify.service';
import {
  ChatPeopleService,
  type PeerSummary,
} from '../people/chat-people.service';
import type { OpenConversationDto } from '../dto/chat.dto';
import {
  BANNED_EDIT_MESSAGE,
  EDIT_EXPIRED_MESSAGE,
  EDIT_ONLY_TEXT_MESSAGE,
  EDIT_WINDOW_MS,
  REPLY_GONE_MESSAGE,
} from '../chat.constants';

export interface MessageView {
  id: string;
  senderId: number;
  mine: boolean;
  kind: 'TEXT' | 'IMAGE' | 'VOICE';
  text: string | null;
  file: {
    mime: string;
    sizeBytes: number | null;
    durationSec: number | null;
    purged: boolean;
  } | null;
  createdAt: string;
  /** Set once the sender changed the text; the first text stays with the CEO. */
  editedAt: string | null;
  replyTo: ReplyView | null;
}

/** What a reply shows of the message it answers; never a file or a key. */
export interface ReplyView {
  id: string;
  mine: boolean;
  kind: 'TEXT' | 'IMAGE' | 'VOICE';
  preview: string;
  deleted: boolean;
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

interface LastRow {
  conversationId: string;
  senderId: number;
  kind: string;
  text: string | null;
  createdAt: Date;
}

const PAGE = 30;
const pair = (a: number, b: number) =>
  a < b ? { low: a, high: b } : { low: b, high: a };

const REPLY_PREVIEW_MAX = 120;
const truncate = (t: string, n: number) =>
  t.length > n ? `${t.slice(0, n - 1)}…` : t;

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
    private readonly notify: ChatNotifyService,
    @Inject(CHAT_RATE_LIMITER) private readonly limiter: RateLimiter,
  ) {}

  private view(
    m: {
      id: string;
      senderId: number;
      kind: string;
      text: string | null;
      mime?: string | null;
      sizeBytes?: number | null;
      durationSec?: number | null;
      mediaPurgedAt?: Date | null;
      createdAt: Date;
      editedAt?: Date | null;
    },
    me: number,
    replyTo: ReplyView | null = null,
  ): MessageView {
    return {
      id: m.id,
      senderId: m.senderId,
      mine: m.senderId === me,
      kind: m.kind as MessageView['kind'],
      text: m.text,
      // The storage key never leaves the server: the client asks for a signed link.
      file:
        m.kind === 'TEXT'
          ? null
          : {
              mime: m.mime ?? '',
              sizeBytes: m.sizeBytes ?? null,
              durationSec: m.durationSec ?? null,
              purged: m.mediaPurgedAt != null,
            },
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      replyTo,
    };
  }

  /** The cards of the messages `rows` answer: one query whatever the page size. */
  private async replyViews(
    rows: { replyToId?: string | null }[],
    me: number,
  ): Promise<Map<string, ReplyView>> {
    const ids = [
      ...new Set(rows.map((r) => r.replyToId).filter((x): x is string => !!x)),
    ];
    if (ids.length === 0) return new Map();
    const parents = await this.prisma.chatMessage.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        senderId: true,
        kind: true,
        text: true,
        deletedAt: true,
      },
    });
    return new Map(
      parents.map((p) => [
        p.id,
        {
          id: p.id,
          mine: p.senderId === me,
          kind: p.kind as ReplyView['kind'],
          deleted: p.deletedAt != null,
          // A deleted message keeps no words in someone else's reply.
          preview: p.deletedAt
            ? ''
            : truncate(p.text ?? PREVIEW[p.kind] ?? '', REPLY_PREVIEW_MAX),
        },
      ]),
    );
  }

  /** The conversation, or 404 — the same answer for "missing" and "not yours". */
  async mine(me: number, conversationId: string) {
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
  ): Promise<{ id: string; peer: PeerSummary }> {
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
    if (existing)
      return { id: existing.id, peer: await this.peerCard(me, peerId) };

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
    return { id: created.id, peer: await this.peerCard(me, peerId) };
  }

  private async peerCard(me: number, peerId: number): Promise<PeerSummary> {
    const card = (await this.people.peerSummaries(me, [peerId])).get(peerId);
    if (!card) throw new NotFoundException("O'quvchi topilmadi");
    return card;
  }

  /**
   * "Typing" ping to the peer: no DB write, one per 2 s per pair, and silent
   * (204) whenever the pair cannot talk, so it never reveals a block.
   */
  async typing(me: number, conversationId: string): Promise<void> {
    const { peerId } = await this.mine(me, conversationId);
    // A banned student cannot write, so their typing is not announced either.
    const self = await this.prisma.student.findFirst({
      where: { id: me },
      select: { chatBannedAt: true },
    });
    if (self?.chatBannedAt) return;
    try {
      await this.assertMayReach(me, peerId);
    } catch {
      return;
    }
    let n: number;
    try {
      n = await this.limiter.hit(
        `chat:typing:${me}:${conversationId}:${Math.floor(Date.now() / 2000)}`,
        5,
      );
    } catch {
      return; // cosmetic: a limiter outage just drops the ping
    }
    if (n > 1) return;
    await this.pushToPeer(peerId, { type: 'chat.typing', conversationId });
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
   * A constant number of queries whatever the page size (≤ 50 conversations):
   * conversations, then peers/privacy/group-mates (`peerSummaries`, ≤ 3),
   * then the last non-deleted message and the unread counts (one raw query each).
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
    if (rows.length === 0) return [];

    const peerOf = (c: (typeof rows)[number]) =>
      c.studentLowId === me ? c.studentHighId : c.studentLowId;
    const peers = await this.people.peerSummaries(me, rows.map(peerOf));
    // A hard-deleted peer has no card: that conversation is skipped, the inbox is not.
    const shown = rows.filter((c) => peers.has(peerOf(c)));
    if (shown.length === 0) return [];
    const ids = shown.map((c) => c.id);

    const [lastRows, unreadRows] = await Promise.all([
      this.prisma.$queryRaw<LastRow[]>`
        SELECT DISTINCT ON (m."conversationId")
          m."conversationId", m."senderId", m."kind"::text AS "kind", m."text", m."createdAt"
        FROM "ChatMessage" m
        WHERE m."conversationId" IN (${Prisma.join(ids)})
          AND m."deletedAt" IS NULL
        ORDER BY m."conversationId", m."createdAt" DESC, m."id" DESC`,
      this.prisma.$queryRaw<{ conversationId: string; n: number }[]>`
        SELECT m."conversationId", COUNT(*)::int AS "n"
        FROM "ChatMessage" m
        LEFT JOIN "ChatReadState" r
          ON r."conversationId" = m."conversationId" AND r."studentId" = ${me}
        WHERE m."conversationId" IN (${Prisma.join(ids)})
          AND m."senderId" <> ${me}
          AND m."deletedAt" IS NULL
          AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
        GROUP BY m."conversationId"`,
    ]);
    const lastBy = new Map(lastRows.map((l) => [l.conversationId, l]));
    const unreadBy = new Map(unreadRows.map((u) => [u.conversationId, u.n]));

    return shown.map((c) => {
      const last = lastBy.get(c.id);
      return {
        id: c.id,
        peer: peers.get(peerOf(c))!,
        lastMessage: last
          ? {
              preview: last.text ?? PREVIEW[last.kind] ?? '',
              at: last.createdAt.toISOString(),
              mine: last.senderId === me,
            }
          : null,
        unread: unreadBy.get(c.id) ?? 0,
      };
    });
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
    const replies = await this.replyViews(page, me);
    return {
      data: page.map((m) =>
        this.view(m, me, (m.replyToId && replies.get(m.replyToId)) || null),
      ),
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
    };
  }

  /** Every check a message needs, in the agreed order; returns the other side. */
  async prepareSend(
    me: number,
    companyId: number,
    conversationId: string,
    replyToId?: string,
  ): Promise<{ peerId: number }> {
    await this.access.assertCanWrite(me, companyId);
    const { peerId } = await this.mine(me, conversationId);
    await this.assertMayReach(me, peerId);
    await this.countAgainstLimit(`chat:rate:${me}`, RATE_PER_MINUTE);
    if (replyToId) await this.assertReplyTarget(conversationId, replyToId);
    return { peerId };
  }

  /** A reply answers a live message of the SAME conversation, nothing else. */
  private async assertReplyTarget(conversationId: string, replyToId: string) {
    const parent = await this.prisma.chatMessage.findFirst({
      where: { id: replyToId, conversationId, deletedAt: null },
      select: { id: true },
    });
    if (!parent) throw new BadRequestException(REPLY_GONE_MESSAGE);
  }

  async commitMessage(
    me: number,
    companyId: number,
    conversationId: string,
    peerId: number,
    data: {
      kind: 'TEXT' | 'IMAGE' | 'VOICE';
      text?: string;
      fileKey?: string;
      mime?: string;
      sizeBytes?: number;
      durationSec?: number | null;
      replyToId?: string;
    },
  ): Promise<MessageView> {
    const row = await this.prisma.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({
        data: { conversationId, senderId: me, ...data },
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

    const reply = row.replyToId
      ? (await this.replyViews([row], peerId)).get(row.replyToId)
      : undefined;
    await this.pushToPeer(peerId, {
      type: 'chat.message',
      conversationId,
      message: this.view(row, peerId, reply ?? null),
    });
    // After the commit, not awaited: the notifier never throws and Telegram is slow.
    void this.notify.onMessage({
      conversationId,
      senderId: me,
      recipientId: peerId,
      companyId,
    });
    const mineReply = row.replyToId
      ? (await this.replyViews([row], me)).get(row.replyToId)
      : undefined;
    return this.view(row, me, mineReply ?? null);
  }

  async send(
    me: number,
    companyId: number,
    conversationId: string,
    text: string,
    replyToId?: string,
  ): Promise<MessageView> {
    const { peerId } = await this.prepareSend(
      me,
      companyId,
      conversationId,
      replyToId,
    );
    return this.commitMessage(me, companyId, conversationId, peerId, {
      kind: 'TEXT',
      text,
      replyToId,
    });
  }

  async markRead(me: number, conversationId: string): Promise<{ ok: true }> {
    const { peerId } = await this.mine(me, conversationId);
    const readAt = new Date();
    await this.prisma.chatReadState.upsert({
      where: { conversationId_studentId: { conversationId, studentId: me } },
      create: { conversationId, studentId: me, lastReadAt: readAt },
      update: { lastReadAt: readAt },
    });
    await this.notify.onRead(me, conversationId);
    await this.pushToPeer(peerId, {
      type: 'chat.read',
      conversationId,
      readAt: readAt.toISOString(),
    });
    return { ok: true };
  }

  /**
   * The sender changes the text of their own message, up to 3 hours after it
   * was sent. The first text is kept (once) for a report; the peer sees the new
   * one live. Files cannot be edited, and a banned student cannot edit.
   */
  async editOwn(
    me: number,
    messageId: string,
    text: string,
  ): Promise<MessageView> {
    const m = await this.prisma.chatMessage.findFirst({
      where: { id: messageId, senderId: me, deletedAt: null },
    });
    if (!m) throw new NotFoundException('Xabar topilmadi');
    if (m.kind !== 'TEXT') {
      throw new BadRequestException(EDIT_ONLY_TEXT_MESSAGE);
    }
    const self = await this.prisma.student.findFirst({
      where: { id: me },
      select: { chatBannedAt: true },
    });
    if (self?.chatBannedAt) throw new ForbiddenException(BANNED_EDIT_MESSAGE);
    if (Date.now() - m.createdAt.getTime() > EDIT_WINDOW_MS) {
      throw new BadRequestException(EDIT_EXPIRED_MESSAGE);
    }
    const { peerId } = await this.mine(me, m.conversationId);
    const reply = (await this.replyViews([m], me)).get(m.replyToId ?? '');
    if (m.text === text) return this.view(m, me, reply ?? null);
    await this.countAgainstLimit(`chat:edit:${me}`, RATE_PER_MINUTE);
    const editedAt = new Date();
    const done = await this.prisma.chatMessage.updateMany({
      where: { id: messageId, senderId: me, deletedAt: null },
      data: { text, editedAt, originalText: m.originalText ?? m.text },
    });
    if (done.count === 0) throw new NotFoundException('Xabar topilmadi');
    const row = { ...m, text, editedAt };
    const peerReply = (await this.replyViews([m], peerId)).get(
      m.replyToId ?? '',
    );
    await this.pushToPeer(peerId, {
      type: 'chat.edit',
      conversationId: m.conversationId,
      message: this.view(row, peerId, peerReply ?? null),
    });
    return this.view(row, me, reply ?? null);
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
