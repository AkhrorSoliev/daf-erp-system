import { UserStatus } from '@prisma/client';
import {
  signInStaffWhere,
  staffLinkedToChatWhere,
  staffPortalFor,
} from '../../common/auth/staff-telegram';
import type { PrismaService } from '../../prisma/prisma.service';
import { staffMiniAppUrl } from '../../telegram/staff/staff-cabinet';
import { shortName, type TgTaskView } from './task-telegram-text';

type ViewDb = Pick<
  PrismaService,
  'task' | 'student' | 'group' | 'lead' | 'user'
>;
type UserDb = Pick<PrismaService, 'user'>;

/** The task as a Telegram message needs it; null when it is gone. */
export async function loadTaskView(
  db: ViewDb,
  taskId: string,
): Promise<TgTaskView | null> {
  const t = await db.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      companyId: true,
      kind: true,
      title: true,
      status: true,
      priority: true,
      dueAt: true,
      requiresPhoto: true,
      authorId: true,
      entityType: true,
      entityId: true,
      author: { select: { firstName: true, lastName: true } },
      participants: {
        select: {
          userId: true,
          role: true,
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      steps: {
        select: { id: true, title: true, doneAt: true },
        orderBy: { position: 'asc' },
      },
    },
  });
  if (!t) return null;
  return {
    id: t.id,
    companyId: t.companyId,
    kind: t.kind,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueAt: t.dueAt,
    requiresPhoto: t.requiresPhoto,
    authorId: t.authorId,
    authorName: t.author
      ? shortName(t.author.firstName, t.author.lastName)
      : null,
    entityLabel: await entityLabel(db, t.entityType, t.entityId),
    participants: t.participants.map((p) => ({
      userId: p.userId,
      role: p.role,
      name: shortName(p.user.firstName, p.user.lastName),
    })),
    steps: t.steps.map((s) => ({
      id: s.id,
      title: s.title,
      done: s.doneAt !== null,
    })),
  };
}

/** «Bog'liq:» — the linked student, group, lead or employee (COMMENTABLE_ENTITY_TYPES). */
async function entityLabel(
  db: ViewDb,
  type: string | null,
  id: string | null,
): Promise<string | null> {
  if (!type || !id) return null;
  const numeric = Number(id);
  switch (type) {
    case 'Group': {
      const g = await db.group.findUnique({
        where: { id },
        select: { name: true },
      });
      return g ? `${g.name} guruh` : null;
    }
    case 'Lead': {
      const l = await db.lead.findUnique({
        where: { id },
        select: { firstName: true, lastName: true },
      });
      return l ? `${l.lastName} ${l.firstName} (lid)` : null;
    }
    case 'Student': {
      if (!Number.isInteger(numeric)) return null;
      const s = await db.student.findUnique({
        where: { id: numeric },
        select: { firstName: true, lastName: true },
      });
      return s ? `${s.lastName} ${s.firstName}` : null;
    }
    case 'User': {
      if (!Number.isInteger(numeric)) return null;
      const u = await db.user.findUnique({
        where: { id: numeric },
        select: { firstName: true, lastName: true },
      });
      return u ? `${u.lastName} ${u.firstName}` : null;
    }
    default:
      return null;
  }
}

export type ChatStaff =
  | { kind: 'one'; userId: number; companyId: number; roleIds: number[] }
  | { kind: 'none' }
  | { kind: 'several' };

/**
 * Who presses a button or replies (spec §6.5): the chat's live staff account,
 * by the same where-clause as the staff menu and the Mini App (ADR-0045).
 * Two live accounts on one chat fail closed — never pick one.
 */
export async function staffOfChat(
  db: UserDb,
  chatId: string,
): Promise<ChatStaff> {
  const rows = await db.user.findMany({
    where: staffLinkedToChatWhere(chatId),
    select: { id: true, companyId: true, roles: { select: { roleId: true } } },
    orderBy: { id: 'asc' },
    take: 2,
  });
  if (rows.length === 0) return { kind: 'none' };
  if (rows.length > 1) return { kind: 'several' };
  return {
    kind: 'one',
    userId: rows[0].id,
    companyId: rows[0].companyId,
    roleIds: rows[0].roles.map((r) => r.roleId),
  };
}

/**
 * Where a notice for this person goes, checked at send time: an ACTIVE sign-in
 * staff account (an inactive employee gets no Telegram, as no bell — server/
 * CLAUDE.md «Recipient filter») with a linked chat that no other live staff
 * account shares. The owner count stays on `staffLinkedToChatWhere`: a chat
 * shared with an inactive-but-sign-in account still fails closed.
 */
export async function staffChatOf(
  db: UserDb,
  userId: number,
): Promise<{ chatId: string; roleIds: number[] } | null> {
  const u = await db.user.findFirst({
    where: {
      id: userId,
      ...signInStaffWhere(),
      status: UserStatus.ACTIVE,
      isActive: true,
      telegramChatId: { not: null },
    },
    select: { telegramChatId: true, roles: { select: { roleId: true } } },
  });
  if (!u?.telegramChatId) return null;
  const owners = await db.user.count({
    where: staffLinkedToChatWhere(u.telegramChatId),
  });
  return owners === 1
    ? { chatId: u.telegramChatId, roleIds: u.roles.map((r) => r.roleId) }
    : null;
}

/**
 * `staffChatOf`'s rule for a whole list in ONE query (the assignee picker's
 * «Telegram ulanmagan»; a query per row would not do): the ids among `people`
 * a notice would reach. Reads every sign-in staff account on the people's
 * chats, so a chat shared with somebody outside the list is seen too.
 */
export async function usersWithTelegram(
  db: UserDb,
  people: { id: number; telegramChatId: string | null }[],
): Promise<Set<number>> {
  const chats = [
    ...new Set(
      people.flatMap((p) => (p.telegramChatId ? [p.telegramChatId] : [])),
    ),
  ];
  if (chats.length === 0) return new Set();
  const owners = await db.user.findMany({
    where: { ...signInStaffWhere(), telegramChatId: { in: chats } },
    select: { id: true, telegramChatId: true, status: true, isActive: true },
  });
  const byChat = new Map<string, typeof owners>();
  for (const o of owners) {
    byChat.set(o.telegramChatId!, [
      ...(byChat.get(o.telegramChatId!) ?? []),
      o,
    ]);
  }
  const linked = new Set<number>();
  for (const p of people) {
    const sole = p.telegramChatId ? byChat.get(p.telegramChatId) : undefined;
    // Alone on the chat, and ACTIVE (the same two fields as in `staffChatOf`).
    if (
      sole?.length === 1 &&
      sole[0].id === p.id &&
      sole[0].status === UserStatus.ACTIVE &&
      sole[0].isActive
    ) {
      linked.add(p.id);
    }
  }
  return linked;
}

/**
 * «Ochish»: `/tasks?task=<id>` on the reader's portal (`staffPortalFor`), the
 * host taken from `TELEGRAM_MINI_APP_URL` the way the staff cabinet takes it.
 * No address (or a non-`student.` host, a local tunnel) → no button.
 */
export function taskOpenUrl(
  studentMiniAppUrl: string | undefined,
  roleIds: number[],
  taskId: string,
): string | undefined {
  const portal = staffPortalFor(roleIds);
  const cabinet = portal
    ? staffMiniAppUrl(studentMiniAppUrl, portal)
    : undefined;
  return cabinet
    ? `${new URL(cabinet).origin}/tasks?task=${taskId}`
    : undefined;
}
