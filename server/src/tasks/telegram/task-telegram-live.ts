import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import {
  classifyTelegramError,
  describeError,
} from '../../telegram-digest/telegram-send';
import { editExtra, renderLiveCard } from './task-telegram-text';
import { loadTaskView } from './task-telegram-view';
import { TaskTelegramSender } from './task-telegram.sender';

const GONE =
  /message to edit not found|message can't be edited|MESSAGE_ID_INVALID/i;
const NOT_MODIFIED = /message is not modified/i;
const MAX_WAIT_S = 30;

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The live task card (ADR-0089): one message per person per task, edited in
 * place after every change. `refresh` never throws — a card that cannot be
 * edited costs nothing but itself.
 */
@Injectable()
export class TaskTelegramLive {
  private readonly logger = new Logger(TaskTelegramLive.name);

  constructor(
    private prisma: PrismaService,
    private telegram: TelegramService,
    private sender: TaskTelegramSender,
  ) {}

  /** Edits every live card of the task; never throws. `sleep` is injectable for tests. */
  async refresh(taskId: string, sleep = realSleep): Promise<void> {
    try {
      const client = this.telegram.getBot()?.telegram;
      if (!client) return;
      const rows = await this.prisma.taskTelegramMessage.findMany({
        where: { taskId, purpose: 'CARD' },
        select: { id: true, chatId: true, messageId: true, userId: true },
        orderBy: { createdAt: 'asc' },
      });
      if (rows.length === 0) return;
      const view = await loadTaskView(this.prisma, taskId);
      if (!view) return;
      const users = await this.prisma.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
        select: { id: true, roles: { select: { roleId: true } } },
      });
      const roles = new Map(
        users.map((u) => [u.id, u.roles.map((r) => r.roleId)]),
      );
      const now = new Date();
      for (const row of rows) {
        const msg = renderLiveCard(view, row.userId, {
          now,
          openUrl: this.sender.openUrl(roles.get(row.userId) ?? [], taskId),
        });
        const edit = () =>
          client.editMessageText(
            row.chatId,
            row.messageId,
            undefined,
            msg.text,
            editExtra(msg.buttons),
          );
        const outcome = await this.tryEdit(edit, row.id, sleep);
        if (outcome === 'stop') return;
      }
    } catch (err) {
      this.logger.error(
        `task ${taskId}: live cards not refreshed: ${describeError(err)}`,
      );
    }
  }

  private async tryEdit(
    edit: () => Promise<unknown>,
    rowId: string,
    sleep: (ms: number) => Promise<void>,
    retried = false,
  ): Promise<'ok' | 'stop'> {
    try {
      await edit();
      return 'ok';
    } catch (err) {
      const f = classifyTelegramError(err);
      if (NOT_MODIFIED.test(f.description)) return 'ok';
      if (f.kind === 'permanent' || GONE.test(f.description)) {
        // The card is gone (deleted, chat blocked): the row has nothing to point at.
        await this.prisma.taskTelegramMessage.deleteMany({
          where: { id: rowId },
        });
        return 'ok';
      }
      if (f.retryAfter !== null && !retried) {
        await sleep(Math.min(f.retryAfter, MAX_WAIT_S) * 1000);
        return this.tryEdit(edit, rowId, sleep, true);
      }
      this.logger.warn(
        `live card ${rowId} not edited: ${f.description.slice(0, 300)}`,
      );
      // A second 429 means the bot is throttled: the later cards would hit it too.
      return f.retryAfter !== null ? 'stop' : 'ok';
    }
  }
}
