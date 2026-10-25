import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Markup } from 'telegraf';
import { tashkentDateStr } from '../../common/date/tashkent';
import { PrismaService } from '../../prisma/prisma.service';
import { sendTelegramText } from '../../telegram-digest/telegram-send';
import { LEVEL_TEST_ACTION } from '../scenes/level-test.scene';
import { TelegramService } from '../telegram.service';
import { loadInviteAudience } from './level-test-invite.audience';
import {
  LEVEL_TEST_INVITE_BUTTON,
  LEVEL_TEST_INVITE_TEXT,
} from './level-test-invite.text';

/** Xabarlar orasidagi pauza: Telegram'ning sekundiga ~30 xabar chegarasidan pastda. */
const PAUSE_MS = 60;
/** Ketma-ket shuncha vaqtinchalik xato — Telegram yoki tarmoq yotgan, to'xtaymiz. */
const MAX_TRANSIENT_IN_ROW = 5;

export interface InviteRunResult {
  mode: 'off' | 'log' | 'on';
  ran: boolean;
  audience: number;
  sent: number;
  failed: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Bir martalik «Darajani aniqlash» taklifi (ADR-0127).
 *
 * `LEVEL_TEST_INVITE` = `off` (standart) | `log` (auditoriyani sanab yozadi,
 * yubormaydi) | `on`. `LEVEL_TEST_INVITE_DATE` = `YYYY-MM-DD` (Toshkent kuni):
 * faqat shu kuni, soat 20:00 da ishlaydi. Har chatga umr bo'yi bir marta:
 * `LevelTestInvite` qatori yuborishdan OLDIN egallanadi.
 */
@Injectable()
export class LevelTestInviteService {
  private readonly logger = new Logger(LevelTestInviteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  @Cron('0 0 20 * * *', { timeZone: 'Asia/Tashkent' })
  async cron(): Promise<void> {
    try {
      const res = await this.run();
      if (res.ran) this.logger.log(`Taklif: ${JSON.stringify(res)}`);
    } catch (err) {
      this.logger.error(
        `Taklif yiqildi: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private mode(): 'off' | 'log' | 'on' {
    const v = (process.env.LEVEL_TEST_INVITE ?? 'off').trim().toLowerCase();
    return v === 'on' || v === 'log' ? v : 'off';
  }

  async run(now: Date = new Date()): Promise<InviteRunResult> {
    const mode = this.mode();
    const none: InviteRunResult = {
      mode,
      ran: false,
      audience: 0,
      sent: 0,
      failed: 0,
    };
    if (mode === 'off') return none;
    if (process.env.LEVEL_TEST_INVITE_DATE?.trim() !== tashkentDateStr(now)) {
      return none;
    }

    const audience = await loadInviteAudience(this.prisma);
    const base = { mode, ran: true, audience: audience.chats.length };
    if (mode === 'log') {
      this.logger.log(
        `Taklif (log): ${audience.chats.length} chat (o'quvchi ${audience.students}, boshqa ${audience.others}); hech narsa yuborilmadi`,
      );
      return { ...base, sent: 0, failed: 0 };
    }

    const bot = this.telegram.getBot();
    if (!bot) {
      this.logger.error('Taklif: bot yo‘q (TELEGRAM_BOT_TOKEN)');
      return { ...base, sent: 0, failed: 0 };
    }
    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback(LEVEL_TEST_INVITE_BUTTON, LEVEL_TEST_ACTION)],
    ]);

    let sent = 0;
    let failed = 0;
    let transientInRow = 0;
    for (const chatId of audience.chats) {
      // Egallash: qatorni yaratgan chaqiruvgina yuboradi.
      const claimed = await this.prisma.levelTestInvite.createMany({
        data: [{ chatId }],
        skipDuplicates: true,
      });
      if (claimed.count === 0) continue;

      const out = await sendTelegramText(bot, chatId, LEVEL_TEST_INVITE_TEXT, {
        parse_mode: 'HTML',
        reply_markup: keyboard.reply_markup,
      });
      if (out.ok) {
        sent += 1;
        transientInRow = 0;
        await this.prisma.levelTestInvite.update({
          where: { chatId },
          data: { status: 'SENT', sentAt: new Date() },
        });
      } else {
        failed += 1;
        transientInRow = out.kind === 'transient' ? transientInRow + 1 : 0;
        await this.prisma.levelTestInvite.update({
          where: { chatId },
          data: { note: `${out.kind}: ${out.description}`.slice(0, 200) },
        });
        if (transientInRow >= MAX_TRANSIENT_IN_ROW) {
          this.logger.error(
            'Taklif: ketma-ket vaqtinchalik xatolar, to‘xtatildi',
          );
          break;
        }
      }
      await sleep(PAUSE_MS);
    }
    return { ...base, sent, failed };
  }
}
