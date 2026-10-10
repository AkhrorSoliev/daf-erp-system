import {
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { Composer } from 'telegraf';
import type { Message } from 'telegraf/types';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import type { BotContext } from '../../telegram/types/context';
import { describeError } from '../../telegram-digest/telegram-send';
import { TasksService, type TaskActor } from '../tasks.service';
import { ONLY_GIVER_REVIEWS, OPEN_STATUSES } from '../task-transitions';
import {
  ADDED_TO_TASK,
  NOT_IN_REVIEW,
  NOT_YOURS,
  RETURN_PLACEHOLDER,
  SEVERAL_ACCOUNTS,
  STEP_GONE,
  TEXT_ONLY,
  TRY_LATER,
  clip,
  editExtra,
  isSelfTask,
  keptHeadline,
  messageExtra,
  parseTk,
  renderMyTasks,
  renderStepsMessage,
  renderTaskMessage,
  returnPromptText,
  returnedReply,
  shortName,
  type TgMessage,
  type TgTaskView,
} from './task-telegram-text';
import { loadTaskView, staffOfChat } from './task-telegram-view';
import { TaskTelegramSender } from './task-telegram.sender';

/** The person behind the chat, as `TasksService` takes them. */
interface Me {
  actor: TaskActor;
  chatId: string;
}

/** A task the person may act on, and whether they may also review it. */
interface Seen {
  view: TgTaskView;
  canManage: boolean;
}

/** «Topshiriqlarim» shows this many; the count says how many more are on the website. */
const LIST_SIZE = 10;

/** `answerCbQuery` takes at most 200 characters; `clip` adds one more for «…». */
const ALERT_CLIP = 199;

/** The text of the message whose button was pressed (plain, as Telegram returns it). */
function pressedText(ctx: BotContext): string | undefined {
  const m = ctx.callbackQuery?.message;
  return m && 'text' in m ? m.text : undefined;
}

/** `/cancel` typed as a reply is still the bot's command, not a comment. */
function startsWithCommand(msg: Message): boolean {
  return (
    'entities' in msg &&
    !!msg.entities?.some((e) => e.type === 'bot_command' && e.offset === 0)
  );
}

/**
 * Task buttons and replies in the main bot (spec §6.1–6.5, ADR-0077). Every
 * change goes through `TasksService` as the chat's staff account with
 * `via: 'TELEGRAM'`: the website's policy and transitions, nothing extra here.
 * The pressed message is edited in place.
 */
@Injectable()
export class TaskTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TaskTelegramHandler.name);

  constructor(
    private prisma: PrismaService,
    private tasks: TasksService,
    private telegram: TelegramService,
    private sender: TaskTelegramSender,
  ) {}

  /**
   * Runs after every module's onModuleInit, so the bot exists. One composer,
   * registered ahead of the scenes: a registration scene left open would
   * otherwise swallow a press or a reply. It calls `next()` for everything
   * that is not a task button or a reply to a task message.
   */
  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return; // no TELEGRAM_BOT_TOKEN — the bot is off
    const tk = new Composer<BotContext>();
    tk.action(/^tk:/, (ctx) => this.onAction(ctx));
    tk.on('message', (ctx, next) => this.onMessage(ctx, next));
    this.telegram.useBeforeScenes(tk);
  }

  async onAction(ctx: BotContext): Promise<void> {
    try {
      await this.handleAction(ctx);
    } catch (err) {
      // Never let a task button take the bot's update loop down.
      this.logger.error(`task button failed: ${describeError(err)}`);
      await ctx.answerCbQuery(TRY_LATER).catch(() => undefined);
    }
  }

  private async handleAction(ctx: BotContext): Promise<void> {
    const q = ctx.callbackQuery;
    const cmd = parseTk(q && 'data' in q ? q.data : '');
    if (!cmd || ctx.chat?.type !== 'private') return this.answer(ctx);
    const me = await this.me(String(ctx.chat.id), (t) => this.answer(ctx, t));
    if (!me) return;
    if (cmd.action === 'list') return this.showList(ctx, me);

    // A step carries no task id: its task decides who may tick it.
    let taskId = cmd.id;
    if (cmd.action === 'step') {
      const step = await this.prisma.taskStep.findUnique({
        where: { id: cmd.id },
        select: { taskId: true },
      });
      if (!step) return this.answer(ctx, STEP_GONE);
      taskId = step.taskId;
    }
    // A number in the list: the list's other numbers still work.
    const seen = await this.access(ctx, me, taskId, cmd.action !== 'show');
    if (!seen) return;
    const { view } = seen;
    const headline = keptHeadline(pressedText(ctx), view.title);

    switch (cmd.action) {
      case 'show':
        await this.answer(ctx);
        return this.sendCard(ctx, me, view);
      case 'steps':
        await this.answer(ctx);
        return this.drawSteps(ctx, view);
      case 'back':
        await this.answer(ctx);
        return this.drawCard(ctx, me, view, undefined);
      case 'return':
        return this.askReason(ctx, me, seen, headline);
    }

    try {
      if (cmd.action === 'step') {
        const done = view.steps.find((s) => s.id === cmd.id)?.done ?? false;
        await this.tasks.updateStep(taskId, cmd.id, { done: !done }, me.actor);
        await this.answer(ctx);
        return this.drawSteps(ctx, await loadTaskView(this.prisma, taskId));
      }
      if (cmd.action === 'start') {
        await this.tasks.changeStatus(taskId, 'IN_PROGRESS', me.actor);
      } else if (cmd.action === 'done') {
        const to = isSelfTask(view, me.actor.userId) ? 'DONE' : 'IN_REVIEW';
        await this.tasks.changeStatus(taskId, to, me.actor);
      } else {
        await this.tasks.review(taskId, 'ACCEPT', undefined, me.actor);
      }
      await this.answer(ctx);
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      // The task itself is lost to this person (a vanished step is not): its
      // card, which is not scoped to them, is not redrawn for them.
      if (
        err instanceof NotFoundException &&
        !(await this.lookup(me, taskId))
      ) {
        await this.answer(ctx, NOT_YOURS);
        return this.dropButtons(ctx);
      }
      // A stale message: say why, then show the task as it is now.
      await this.answer(ctx, err.message);
    }
    await this.drawCard(
      ctx,
      me,
      await loadTaskView(this.prisma, taskId),
      headline,
    );
  }

  /**
   * The chat's one live staff account, or null after `say`ing why not (spec
   * §6.5): a press answers with an alert, a reply with a message.
   */
  private async me(
    chatId: string,
    say: (text: string) => Promise<unknown>,
  ): Promise<Me | null> {
    const who = await staffOfChat(this.prisma, chatId);
    if (who.kind !== 'one') {
      await say(who.kind === 'several' ? SEVERAL_ACCOUNTS : NOT_YOURS);
      return null;
    }
    try {
      const actor = await this.tasks.loadActor(who.userId, who.companyId, null);
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
  private async lookup(me: Me, taskId: string): Promise<Seen | null> {
    try {
      const { access } = await this.tasks.loadForAccess(
        this.prisma,
        taskId,
        me.actor,
      );
      const view = await loadTaskView(this.prisma, taskId);
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

  /** `lookup` for a press: when it is not the presser's, say so (and drop the buttons). */
  private async access(
    ctx: BotContext,
    me: Me,
    taskId: string,
    dropButtons: boolean,
  ): Promise<Seen | null> {
    const seen = await this.lookup(me, taskId);
    if (seen) return seen;
    await this.answer(ctx, NOT_YOURS);
    if (dropButtons) await this.dropButtons(ctx);
    return null;
  }

  /** Telegram spins the button until the press is answered; `alert` pops up. */
  private async answer(ctx: BotContext, alert?: string): Promise<void> {
    try {
      await (alert === undefined
        ? ctx.answerCbQuery()
        : ctx.answerCbQuery(clip(alert, ALERT_CLIP), { show_alert: true }));
    } catch (err) {
      this.logger.warn(`task button not answered: ${describeError(err)}`);
    }
  }

  private async edit(ctx: BotContext, msg: TgMessage): Promise<void> {
    await ctx
      .editMessageText(msg.text, editExtra(msg.buttons))
      .catch((err) => this.editFailed(err));
  }

  private async dropButtons(ctx: BotContext): Promise<void> {
    await ctx
      .editMessageReplyMarkup(undefined)
      .catch((err) => this.editFailed(err));
  }

  /** «message is not modified»: the message already shows it, not a failure. */
  private editFailed(err: unknown): void {
    const why = describeError(err);
    if (/message is not modified/i.test(why)) return;
    this.logger.warn(`task message not edited: ${why}`);
  }

  private drawCard(
    ctx: BotContext,
    me: Me,
    view: TgTaskView | null,
    headline: string | undefined,
  ): Promise<void> {
    if (!view) return this.dropButtons(ctx);
    return this.edit(ctx, this.card(me, view, headline));
  }

  private drawSteps(ctx: BotContext, view: TgTaskView | null): Promise<void> {
    if (!view) return this.dropButtons(ctx);
    return this.edit(ctx, renderStepsMessage(view));
  }

  private card(me: Me, view: TgTaskView, headline?: string): TgMessage {
    return renderTaskMessage(
      view,
      { kind: 'CARD', headline },
      me.actor.userId,
      {
        now: new Date(),
        openUrl: this.sender.openUrl(me.actor.roleIds, view.id),
      },
    );
  }

  /** A number from «Topshiriqlarim»: the card as a new message, so the list stays. */
  private async sendCard(
    ctx: BotContext,
    me: Me,
    view: TgTaskView,
  ): Promise<void> {
    const msg = this.card(me, view);
    const sent = await ctx.reply(msg.text, messageExtra(msg.buttons));
    await this.sender.record(
      me.chatId,
      sent.message_id,
      view,
      me.actor.userId,
      'NOTICE',
    );
  }

  /**
   * «Qaytarish»: the reason comes as a reply to this prompt (`handleReply`).
   * The prompt quotes the pressed card and names the task, so with two prompts
   * open a reason can never silently go to the wrong task.
   */
  private async askReason(
    ctx: BotContext,
    me: Me,
    { view, canManage }: Seen,
    headline: string | undefined,
  ): Promise<void> {
    if (view.status !== 'IN_REVIEW') {
      await this.answer(ctx, NOT_IN_REVIEW);
      return this.drawCard(ctx, me, view, headline);
    }
    if (!canManage) {
      await this.answer(ctx, ONLY_GIVER_REVIEWS);
      return this.drawCard(ctx, me, view, headline);
    }
    await this.answer(ctx);
    const cardId = ctx.callbackQuery?.message?.message_id;
    const prompt = await ctx.reply(returnPromptText(view.title), {
      parse_mode: 'HTML',
      ...(cardId !== undefined && {
        reply_parameters: {
          message_id: cardId,
          allow_sending_without_reply: true,
        },
      }),
      reply_markup: {
        force_reply: true,
        input_field_placeholder: RETURN_PLACEHOLDER,
      },
    });
    await this.sender.record(
      me.chatId,
      prompt.message_id,
      view,
      me.actor.userId,
      'RETURN_PROMPT',
    );
  }

  /**
   * «📋 Topshiriqlarim» (spec §6.3): due first, the undated last; the renderer
   * neither sorts nor caps. «Dars bo'ldimi?» is never shown in Telegram.
   */
  private async showList(ctx: BotContext, me: Me): Promise<void> {
    const where: Prisma.TaskWhereInput = {
      companyId: me.actor.companyId,
      status: { in: [...OPEN_STATUSES] },
      kind: { not: 'LESSON_QUESTION' },
      participants: { some: { userId: me.actor.userId, role: 'ASSIGNEE' } },
    };
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy: [
          { dueAt: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'asc' },
        ],
        take: LIST_SIZE,
        select: { id: true, title: true, dueAt: true },
      }),
      this.prisma.task.count({ where }),
    ]);
    await this.answer(ctx);
    const msg = renderMyTasks(items, total, new Date());
    await ctx.reply(msg.text, messageExtra(msg.buttons));
  }

  /**
   * A message in a private chat (spec §6.2). Only a reply to a task message of
   * THIS chat is ours; anything else — an ordinary message, a reply to some
   * other message, a command — goes on to the scenes and the bot's own flows.
   * `next()` is called outside the `try`: a failure further down the chain is
   * not a failed reply.
   */
  async onMessage(ctx: BotContext, next: () => Promise<void>): Promise<void> {
    let ours: boolean;
    try {
      ours = await this.handleReply(ctx);
    } catch (err) {
      this.logger.error(`task reply failed: ${describeError(err)}`);
      await ctx.reply(TRY_LATER).catch(() => undefined);
      return;
    }
    if (!ours) return next();
  }

  /** True when the message was a reply to a task message and has been answered. */
  private async handleReply(ctx: BotContext): Promise<boolean> {
    const msg = ctx.message;
    const replyTo =
      msg && 'reply_to_message' in msg ? msg.reply_to_message : undefined;
    if (
      !msg ||
      !replyTo ||
      ctx.chat?.type !== 'private' ||
      startsWithCommand(msg)
    ) {
      return false;
    }
    const chatId = String(ctx.chat.id);
    const link = await this.prisma.taskTelegramMessage.findUnique({
      where: { chatId_messageId: { chatId, messageId: replyTo.message_id } },
      select: { taskId: true, purpose: true },
    });
    if (!link) return false;
    // Photos, files and voice come with phase 3; nothing is stored now.
    const text = 'text' in msg ? msg.text.trim() : '';
    if (!text) {
      await ctx.reply(TEXT_ONLY);
      return true;
    }
    const me = await this.me(chatId, (t) => ctx.reply(t));
    if (!me) return true;
    // The same rule as for a button: the replier must be the author or on it.
    const seen = await this.lookup(me, link.taskId);
    if (!seen) {
      await ctx.reply(NOT_YOURS);
      return true;
    }
    try {
      switch (link.purpose) {
        case 'RETURN_PROMPT': {
          const task = await this.tasks.review(
            link.taskId,
            'RETURN',
            text,
            me.actor,
          );
          await this.ack(
            ctx,
            returnedReply(
              task.assignees.map((a) => shortName(a.firstName, a.lastName)),
            ),
          );
          break;
        }
        case 'NOTICE':
          await this.tasks.addComment(link.taskId, text, me.actor);
          await this.ack(ctx, ADDED_TO_TASK);
          break;
        default:
          // PHOTO_PROMPT (phase 3) or a later purpose: give it a case above.
          this.logger.warn(
            `task ${link.taskId}: a reply to a ${link.purpose} message was not stored`,
          );
          await ctx.reply(TEXT_ONLY);
      }
    } catch (err) {
      if (!(err instanceof HttpException)) throw err;
      await ctx.reply(
        err instanceof NotFoundException ? NOT_YOURS : err.message,
      );
    }
    return true;
  }

  /** The write is committed: a lost «done» message is logged, never TRY_LATER (a resend would repeat it). */
  private async ack(ctx: BotContext, text: string): Promise<void> {
    await ctx
      .reply(text)
      .catch((err) =>
        this.logger.warn(`task reply not confirmed: ${describeError(err)}`),
      );
  }
}
