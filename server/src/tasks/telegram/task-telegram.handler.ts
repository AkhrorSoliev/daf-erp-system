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
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import type { BotContext } from '../../telegram/types/context';
import { describeError } from '../../telegram-digest/telegram-send';
import { TasksService, type TaskActor } from '../tasks.service';
import { OPEN_STATUSES } from '../task-transitions';
import {
  NOT_IN_REVIEW,
  NOT_YOURS,
  RETURN_PLACEHOLDER,
  RETURN_PROMPT,
  SEVERAL_ACCOUNTS,
  STEP_GONE,
  TRY_LATER,
  editExtra,
  isSelfTask,
  keptHeadline,
  messageExtra,
  parseTk,
  renderMyTasks,
  renderStepsMessage,
  renderTaskMessage,
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

/** «Topshiriqlarim» shows this many; the count says how many more are on the website. */
const LIST_SIZE = 10;

/** The text of the message whose button was pressed (plain, as Telegram returns it). */
function pressedText(ctx: BotContext): string | undefined {
  const m = ctx.callbackQuery?.message;
  return m && 'text' in m ? m.text : undefined;
}

/**
 * Task buttons in the main bot (spec §6.1–6.5, ADR-0077). Every change goes
 * through `TasksService` as the chat's staff account with `via: 'TELEGRAM'`:
 * the website's policy and transitions, nothing extra here. The pressed
 * message is edited in place.
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
   * Runs after every module's onModuleInit, so the bot exists. Registered
   * ahead of the scenes: a registration scene left open would otherwise
   * swallow the press.
   */
  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return; // no TELEGRAM_BOT_TOKEN — the bot is off
    const tk = new Composer<BotContext>();
    tk.action(/^tk:/, (ctx) => this.onAction(ctx));
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
    const me = await this.me(ctx, String(ctx.chat.id));
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
    const view = await this.access(ctx, me, taskId, cmd.action !== 'show');
    if (!view) return;
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
        return this.askReason(ctx, me, view, headline);
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

  /** The chat's one live staff account, or null after saying why not (spec §6.5). */
  private async me(ctx: BotContext, chatId: string): Promise<Me | null> {
    const who = await staffOfChat(this.prisma, chatId);
    if (who.kind !== 'one') {
      await this.answer(
        ctx,
        who.kind === 'several' ? SEVERAL_ACCOUNTS : NOT_YOURS,
      );
      return null;
    }
    try {
      const actor = await this.tasks.loadActor(who.userId, who.companyId, null);
      return { actor: { ...actor, via: 'TELEGRAM' }, chatId };
    } catch (err) {
      if (!(err instanceof ForbiddenException)) throw err;
      // Blocked or archived since the chat was linked.
      await this.answer(ctx, NOT_YOURS);
      return null;
    }
  }

  /**
   * The task as it is now, or null after saying it is not the presser's: they
   * cannot see it any more, or they are neither its author nor on it.
   */
  private async access(
    ctx: BotContext,
    me: Me,
    taskId: string,
    dropButtons: boolean,
  ): Promise<TgTaskView | null> {
    let view: TgTaskView | null = null;
    try {
      await this.tasks.loadForAccess(this.prisma, taskId, me.actor);
      view = await loadTaskView(this.prisma, taskId);
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
    }
    const userId = me.actor.userId;
    if (
      view &&
      (view.authorId === userId ||
        view.participants.some((p) => p.userId === userId))
    ) {
      return view;
    }
    await this.answer(ctx, NOT_YOURS);
    if (dropButtons) await this.dropButtons(ctx);
    return null;
  }

  /** Telegram spins the button until the press is answered; `alert` pops up. */
  private async answer(ctx: BotContext, alert?: string): Promise<void> {
    try {
      await (alert === undefined
        ? ctx.answerCbQuery()
        : ctx.answerCbQuery(alert, { show_alert: true }));
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

  /** «Qaytarish»: the reason comes as a reply to this prompt (Task 9). */
  private async askReason(
    ctx: BotContext,
    me: Me,
    view: TgTaskView,
    headline: string | undefined,
  ): Promise<void> {
    if (view.status !== 'IN_REVIEW') {
      await this.answer(ctx, NOT_IN_REVIEW);
      return this.drawCard(ctx, me, view, headline);
    }
    await this.answer(ctx);
    const prompt = await ctx.reply(RETURN_PROMPT, {
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
}
