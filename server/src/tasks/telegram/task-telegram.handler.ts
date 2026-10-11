import {
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
import { TasksService } from '../tasks.service';
import {
  lookupSeen,
  resolveMe,
  type Me,
  type Seen,
} from './task-telegram-actor';
import { ONLY_GIVER_REVIEWS, OPEN_STATUSES } from '../task-transitions';
import {
  NOT_IN_REVIEW,
  NOT_YOURS,
  RETURN_PLACEHOLDER,
  STEP_GONE,
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
  type TgMessage,
  type TgTaskView,
} from './task-telegram-text';
import { loadTaskView } from './task-telegram-view';
import { TaskTelegramReplies } from './task-telegram-replies';
import { TaskTelegramSender } from './task-telegram.sender';

/** «Topshiriqlarim» shows this many; the count says how many more are on the website. */
const LIST_SIZE = 10;

/** `answerCbQuery` takes at most 200 characters; `clip` adds one more for «…». */
const ALERT_CLIP = 199;

/** The text of the message whose button was pressed (plain, as Telegram returns it). */
function pressedText(ctx: BotContext): string | undefined {
  const m = ctx.callbackQuery?.message;
  return m && 'text' in m ? m.text : undefined;
}

/**
 * Task buttons and replies in the main bot (spec §6.1–6.5, ADR-0078). Every
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
    private replies: TaskTelegramReplies,
  ) {}

  /** After every onModuleInit (the bot exists). One composer ahead of the scenes, so an
   *  open scene never swallows a task press or reply; everything else goes `next()`. */
  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return; // no TELEGRAM_BOT_TOKEN — the bot is off
    const tk = new Composer<BotContext>();
    tk.action(/^tk:/, (ctx) => this.onAction(ctx));
    tk.on('message', (ctx, next) => this.replies.onMessage(ctx, next));
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
        await this.answer(ctx); // saved: a failed redraw is logged, never «try again»
        const fresh = await loadTaskView(this.prisma, taskId).catch((e) =>
          this.logger.error(`step redraw failed: ${describeError(e)}`),
        );
        if (fresh) await this.drawSteps(ctx, fresh);
        return;
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

  private me(chatId: string, say: (text: string) => Promise<unknown>) {
    return resolveMe(this.prisma, this.tasks, chatId, say);
  }

  private lookup(me: Me, taskId: string) {
    return lookupSeen(this.prisma, this.tasks, me, taskId);
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
}
