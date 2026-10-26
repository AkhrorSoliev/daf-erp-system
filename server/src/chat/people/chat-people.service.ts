import { BadRequestException, Injectable } from '@nestjs/common';
import type { ChatFindWho, ChatWho } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { activeStudentWhere } from '../../students/shared/active-student-where';
import { normalizeUsername } from '../username/chat-username.rules';
import type { UpdatePrivacyDto } from '../dto/chat.dto';
import { maySeePhoto, mayFindByName } from './chat-people.rules';

export interface Privacy {
  whoCanWrite: ChatWho;
  whoCanFind: ChatFindWho;
  whoSeesPhoto: ChatWho;
}

/** What another student may see: never a phone, a debt or a balance. */
export interface PeerSummary {
  id: number;
  firstName: string;
  lastName: string;
  username: string | null;
  photo: string | null;
}

const DEFAULT_PRIVACY: Privacy = {
  whoCanWrite: 'EVERYONE',
  whoCanFind: 'EVERYONE',
  whoSeesPhoto: 'EVERYONE',
};

const PEER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  photo: true,
} as const;

const SEARCH_CANDIDATES = 50;
const SEARCH_RESULTS = 20;

@Injectable()
export class ChatPeopleService {
  constructor(private readonly prisma: PrismaService) {}

  /** True while both students sit in one live group with an ACTIVE enrollment. */
  async sharesGroup(a: number, b: number): Promise<boolean> {
    const hit = await this.prisma.enrollment.findFirst({
      where: {
        studentId: a,
        status: 'ACTIVE',
        deletedAt: null,
        group: {
          deletedAt: null,
          enrollments: {
            some: { studentId: b, status: 'ACTIVE', deletedAt: null },
          },
        },
      },
      select: { id: true },
    });
    return hit !== null;
  }

  async privacyOf(studentId: number): Promise<Privacy> {
    const row = await this.prisma.chatPrivacy.findUnique({
      where: { studentId },
    });
    return row
      ? {
          whoCanWrite: row.whoCanWrite,
          whoCanFind: row.whoCanFind,
          whoSeesPhoto: row.whoSeesPhoto,
        }
      : { ...DEFAULT_PRIVACY };
  }

  async getMine(studentId: number, companyId: number) {
    const [me, privacy, blocks] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id: studentId, companyId, deletedAt: null },
        select: { username: true },
      }),
      this.privacyOf(studentId),
      this.prisma.chatBlock.findMany({
        where: { blockerId: studentId },
        select: { blockedId: true },
      }),
    ]);
    return {
      username: me?.username ?? null,
      ...privacy,
      blockedIds: blocks.map((b) => b.blockedId),
    };
  }

  async updatePrivacy(
    studentId: number,
    dto: UpdatePrivacyDto,
  ): Promise<Privacy> {
    const data = {
      ...(dto.whoCanWrite && { whoCanWrite: dto.whoCanWrite }),
      ...(dto.whoCanFind && { whoCanFind: dto.whoCanFind }),
      ...(dto.whoSeesPhoto && { whoSeesPhoto: dto.whoSeesPhoto }),
    };
    const row = await this.prisma.chatPrivacy.upsert({
      where: { studentId },
      create: { studentId, ...data },
      update: data,
    });
    return {
      whoCanWrite: row.whoCanWrite,
      whoCanFind: row.whoCanFind,
      whoSeesPhoto: row.whoSeesPhoto,
    };
  }

  async block(me: number, target: number): Promise<{ ok: true }> {
    if (me === target) {
      throw new BadRequestException("O'zingizni bloklab bo'lmaydi");
    }
    await this.prisma.chatBlock.upsert({
      where: { blockerId_blockedId: { blockerId: me, blockedId: target } },
      create: { blockerId: me, blockedId: target },
      update: {},
    });
    return { ok: true };
  }

  async unblock(me: number, target: number): Promise<{ ok: true }> {
    await this.prisma.chatBlock.deleteMany({
      where: { blockerId: me, blockedId: target },
    });
    return { ok: true };
  }

  async isBlockedEitherWay(
    a: number,
    b: number,
  ): Promise<{ iBlocked: boolean; blockedMe: boolean }> {
    const rows = await this.prisma.chatBlock.findMany({
      where: {
        OR: [
          { blockerId: a, blockedId: b },
          { blockerId: b, blockedId: a },
        ],
      },
    });
    return {
      iBlocked: rows.some((r) => r.blockerId === a),
      blockedMe: rows.some((r) => r.blockerId === b),
    };
  }

  async findByUsername(companyId: number, raw: string) {
    return this.prisma.student.findFirst({
      where: { username: normalizeUsername(raw), companyId, deletedAt: null },
      select: PEER_SELECT,
    });
  }

  /**
   * The card another student sees, with the photo hidden when its owner limited it.
   * The lookup is by id only (no `deletedAt` filter) so a conversation whose
   * peer was later archived still renders. Precondition: call it only with an
   * id taken from a `ChatConversation` the viewer belongs to (conversations are
   * created after a company-scoped lookup), never with an id from a request.
   */
  async peerSummary(viewerId: number, peerId: number): Promise<PeerSummary> {
    const peer = (await this.peerSummaries(viewerId, [peerId])).get(peerId);
    if (!peer) throw new BadRequestException("O'quvchi topilmadi");
    return peer;
  }

  /**
   * The same cards as `peerSummary`, for many peers in at most 3 queries
   * (students, privacy rows, one group-mate check for the GROUPMATES peers).
   * A peer that does not exist is left out of the map. Same precondition as
   * `peerSummary`: ids come from the viewer's own conversations.
   */
  async peerSummaries(
    viewerId: number,
    peerIds: number[],
  ): Promise<Map<number, PeerSummary>> {
    const out = new Map<number, PeerSummary>();
    const ids = [...new Set(peerIds)];
    if (ids.length === 0) return out;

    const [peers, privacyRows] = await Promise.all([
      this.prisma.student.findMany({
        where: { id: { in: ids } },
        select: PEER_SELECT,
      }),
      this.prisma.chatPrivacy.findMany({ where: { studentId: { in: ids } } }),
    ]);
    const whoSees = new Map(
      privacyRows.map((r) => [r.studentId, r.whoSeesPhoto]),
    );
    const groupmateAsked = peers
      .filter((p) => whoSees.get(p.id) === 'GROUPMATES')
      .map((p) => p.id);
    const sharing = await this.sharingGroupWith(viewerId, groupmateAsked);

    for (const peer of peers) {
      const who = whoSees.get(peer.id) ?? DEFAULT_PRIVACY.whoSeesPhoto;
      out.set(peer.id, {
        ...peer,
        photo: maySeePhoto(who, sharing.has(peer.id)) ? peer.photo : null,
      });
    }
    return out;
  }

  /** Which of `others` share a live group with the viewer (ACTIVE enrollments both sides). */
  private async sharingGroupWith(
    viewerId: number,
    others: number[],
  ): Promise<Set<number>> {
    if (others.length === 0) return new Set();
    const rows = await this.prisma.enrollment.findMany({
      where: {
        studentId: { in: others },
        status: 'ACTIVE',
        deletedAt: null,
        group: {
          deletedAt: null,
          enrollments: {
            some: { studentId: viewerId, status: 'ACTIVE', deletedAt: null },
          },
        },
      },
      select: { studentId: true },
    });
    return new Set(rows.map((r) => r.studentId));
  }

  /**
   * `@username` finds one student exactly, whatever their name-search setting.
   * Anything else is a name search over active students, 2+ characters.
   * ponytail: up to 50 candidates are filtered in memory and the photo test
   * runs per result (≤ 20 queries); move to SQL if a name search gets popular.
   */
  async search(
    viewerId: number,
    companyId: number,
    query: string,
  ): Promise<PeerSummary[]> {
    const q = query.trim();
    let candidates: PeerSummary[];
    let byUsername = false;

    if (q.startsWith('@')) {
      byUsername = true;
      const one = await this.findByUsername(companyId, q);
      candidates = one && one.id !== viewerId ? [one] : [];
    } else {
      candidates = await this.prisma.student.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...activeStudentWhere(),
          id: { not: viewerId },
          OR: [
            { firstName: { contains: q, mode: 'insensitive' } },
            { lastName: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: PEER_SELECT,
        take: SEARCH_CANDIDATES,
        orderBy: [{ firstName: 'asc' }, { id: 'asc' }],
      });
    }
    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    const [privacyRows, blocks] = await Promise.all([
      this.prisma.chatPrivacy.findMany({ where: { studentId: { in: ids } } }),
      // An exact @username is never filtered by a block: an empty result would reveal it.
      byUsername
        ? Promise.resolve([] as { blockerId: number }[])
        : this.prisma.chatBlock.findMany({
            where: { blockerId: { in: ids }, blockedId: viewerId },
          }),
    ]);
    const privacyById = new Map(privacyRows.map((r) => [r.studentId, r]));
    const blockedViewer = new Set(blocks.map((b) => b.blockerId));

    const visible = candidates
      .filter((c) => !blockedViewer.has(c.id))
      .filter(
        (c) =>
          byUsername ||
          mayFindByName(privacyById.get(c.id)?.whoCanFind ?? 'EVERYONE'),
      )
      .slice(0, SEARCH_RESULTS);

    return Promise.all(
      visible.map(async (c) => {
        const who = privacyById.get(c.id)?.whoSeesPhoto ?? 'EVERYONE';
        const shares =
          who === 'GROUPMATES' ? await this.sharesGroup(viewerId, c.id) : false;
        return { ...c, photo: maySeePhoto(who, shares) ? c.photo : null };
      }),
    );
  }
}
