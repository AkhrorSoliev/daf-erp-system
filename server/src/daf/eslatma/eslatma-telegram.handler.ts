import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Composer } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../../telegram/telegram.service';
import type { BotContext } from '../../telegram/types/context';
import { describeError } from '../../telegram-digest/telegram-send';
import { eslatmalarniSaqla } from './eslatma-sozlama';
import {
  KEYINROQ,
  SIZGA_EMAS,
  TOXTATILDI,
  toxtatishKimniki,
} from './eslatma-matn';

/**
 * «Eslatmalarni to'xtatish» tugmasi (`dr:off:<studentId>`, spec S4 §3).
 * Sahnalardan oldin ishlaydi (`useBeforeScenes`, vazifalar va dars bahosi
 * handlerlari kabi): ochiq scene bosishni yutmaydi, boshqa hamma narsa
 * `next()` ga o'tadi. Bosgan chat tugmadagi o'quvchining `telegramChatId`
 * siga teng bo'lishi shart: ota-ona chati bir nechta bolani ulashi mumkin —
 * faqat tugmadagi o'quvchi o'chadi; yo'naltirilgan xabarning tugmasi boshqa
 * chatda hech narsani o'zgartirmaydi.
 */
@Injectable()
export class EslatmaTelegramHandler implements OnApplicationBootstrap {
  private readonly logger = new Logger(EslatmaTelegramHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.telegram.getBot()) return; // TELEGRAM_BOT_TOKEN yo'q — bot o'chiq
    const c = new Composer<BotContext>();
    c.action(/^dr:off:/, (ctx) => this.onAction(ctx));
    this.telegram.useBeforeScenes(c);
  }

  async onAction(ctx: BotContext): Promise<void> {
    try {
      await this.handle(ctx);
    } catch (err) {
      this.logger.error(`eslatma tugmasi yiqildi: ${describeError(err)}`);
      await ctx.answerCbQuery(KEYINROQ).catch(() => undefined);
    }
  }

  private async handle(ctx: BotContext): Promise<void> {
    const q = ctx.callbackQuery;
    const studentId = toxtatishKimniki(q && 'data' in q ? q.data : '');
    if (!studentId || ctx.chat?.type !== 'private') {
      await ctx.answerCbQuery();
      return;
    }
    const s = await this.prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: { companyId: true, telegramChatId: true },
    });
    if (!s || s.telegramChatId !== String(ctx.chat.id)) {
      await ctx.answerCbQuery(SIZGA_EMAS);
      return;
    }
    await eslatmalarniSaqla(this.prisma, studentId, s.companyId, false);
    await ctx.answerCbQuery();
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
    await ctx.reply(TOXTATILDI);
  }
}
