import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TasksService, type TaskActor } from '../tasks.service';
import {
  NOT_YOURS,
  SEVERAL_ACCOUNTS,
  type TgTaskView,
} from './task-telegram-text';
import { loadTaskView, staffOfChat } from './task-telegram-view';

/** The person behind the chat, as `TasksService` takes them. */
export interface Me {
  actor: TaskActor;
  chatId: string;
}

/** A task the person may act on, and whether they may also review it. */
export interface Seen {
  view: TgTaskView;
  canManage: boolean;
}

/**
 * The chat's one live staff account, or null after `say`ing why not (spec
 * §6.5): a press answers with an alert, a reply with a message.
 */
export async function resolveMe(
  prisma: PrismaService,
  tasks: TasksService,
  chatId: string,
  say: (text: string) => Promise<unknown>,
): Promise<Me | null> {
  const who = await staffOfChat(prisma, chatId);
  if (who.kind !== 'one') {
    await say(who.kind === 'several' ? SEVERAL_ACCOUNTS : NOT_YOURS);
    return null;
  }
  try {
    const actor = await tasks.loadActor(who.userId, who.companyId, null);
    return { actor: { ...actor, via: 'TELEGRAM' }, chatId };
  } catch (err) {
    if (!(err instanceof ForbiddenException)) throw err;
    // Blocked or archived since the chat was linked.
    await say(NOT_YOURS);
    return null;
  }
}

/**
 * The task as it is now, or null when it is not this person's: they cannot
 * see it any more, or they are neither its author nor on it.
 */
export async function lookupSeen(
  prisma: PrismaService,
  tasks: TasksService,
  me: Me,
  taskId: string,
): Promise<Seen | null> {
  try {
    const { access } = await tasks.loadForAccess(prisma, taskId, me.actor);
    const view = await loadTaskView(prisma, taskId);
    const userId = me.actor.userId;
    if (
      view &&
      (view.authorId === userId ||
        view.participants.some((p) => p.userId === userId))
    ) {
      return { view, canManage: access.canManage };
    }
  } catch (err) {
    if (!(err instanceof NotFoundException)) throw err;
  }
  return null;
}
