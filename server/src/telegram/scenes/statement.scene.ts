import { Logger } from '@nestjs/common';
import { Markup, Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext } from '../types/context';
import { SCENES } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import type { StatementService } from '../../statements/statement.service';
import { statementFilename } from '../../statements/statement.service';
import { presentStatement } from '../../statements/present-statement';
import {
  CONTACT_NOT_OWN,
  contactBelongsToSender,
} from '../utils/contact-ownership';
import { withProcessingLock } from '../utils/processing-lock';
import {
  linkChat,
  statementMessage,
  studentOfChat,
  studentsForChat,
  studentsForPhone,
  type StatementStudent,
} from '../flows/statement-flow';

const CONTACT_KEYBOARD = Markup.keyboard([
  [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
])
  .resize()
  .oneTime();

/**
 * "💳 To'lovlar": the student's payment statement (ADR-0037) — the answer box
 * as text, then the whole statement as a PDF.
 *   step 1 → the chat holds several students: choose one by name
 *   step 2 → the chat is not linked: wait for the sender's own contact,
 *            checked like the password reset, then link the chat
 */
export function createStatementScene(
  prisma: PrismaService,
  statements: Pick<StatementService, 'pdf'>,
  present: typeof presentStatement = presentStatement,
): Scenes.BaseScene<BotContext> {
  const logger = new Logger('StatementScene');
  const scene = new Scenes.BaseScene<BotContext>(SCENES.STATEMENT);

  async function send(ctx: BotContext, student: StatementStudent) {
    if (student.companyId === null) {
      await ctx.reply(
        "Hisobotni tayyorlab bo'lmadi. Administrator bilan bog'laning.",
      );
      return;
    }
    try {
      const { buffer, model } = await statements.pdf(
        student.id,
        student.companyId,
      );
      await ctx.reply(
        statementMessage(present(model, 'student').answer),
        Markup.removeKeyboard(),
      );
      await ctx.replyWithDocument({
        source: buffer,
        filename: statementFilename(model, false),
      });
    } catch (error) {
      logger.error(
        `Statement for student ${student.id} failed`,
        error as Error,
      );
      await ctx.reply(
        "Hisobotni tayyorlashda xatolik yuz berdi. Keyinroq qayta urinib ko'ring.",
      );
    }
  }

  /** One student → send now. Several → ask which one. */
  async function deliver(ctx: BotContext, students: StatementStudent[]) {
    if (students.length === 1) {
      await withProcessingLock(ctx, () => send(ctx, students[0]));
      await ctx.scene.leave();
      return;
    }
    ctx.session.step = 1;
    ctx.session.data.ids = students.map((s) => s.id);
    await ctx.reply(
      "Qaysi o'quvchining hisobotini yuboray?",
      Markup.inlineKeyboard(
        students.map((s) => [
          Markup.button.callback(
            `${s.firstName} ${s.lastName}`.trim(),
            `stmt_pick:${s.id}`,
          ),
        ]),
      ),
    );
  }

  scene.enter(async (ctx) => {
    ctx.session.data = {};
    ctx.session.step = 0;
    const students = await studentsForChat(prisma, String(ctx.chat!.id));
    if (students.length > 0) {
      await deliver(ctx, students);
      return;
    }
    ctx.session.step = 2;
    await ctx.reply(
      "Sizning Telegram hisobingiz hali tizimga bog'lanmagan.\n\n" +
        "To'lovlar hisobotini olish uchun telefon raqamingizni quyidagi tugma orqali yuboring:",
      CONTACT_KEYBOARD,
    );
  });

  scene.on(message('contact'), async (ctx) => {
    if (ctx.session.step !== 2 || ctx.session.processing) return;
    const contact = ctx.message.contact;

    // Only the sender's own, Telegram-confirmed number: a card with someone
    // else's number would otherwise hand over another student's statement.
    if (!contactBelongsToSender(contact, ctx.from)) {
      await ctx.reply(CONTACT_NOT_OWN, Markup.removeKeyboard());
      return;
    }

    let phone = contact.phone_number.replace(/\D/g, '');
    if (phone.startsWith('998')) phone = phone.slice(3);
    if (phone.length !== 9) {
      await ctx.reply(
        "Telefon raqam noto'g'ri formatda. Qayta urinib ko'ring.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    const students = await studentsForPhone(prisma, phone);
    if (students.length === 0) {
      await ctx.reply(
        "Bu telefon raqam tizimda topilmadi. Administrator bilan bog'laning.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    try {
      await linkChat(
        prisma,
        students.map((s) => s.id),
        String(ctx.chat.id),
      );
    } catch (error) {
      logger.error('linkChat failed', error as Error);
      await ctx.reply(
        "Xatolik yuz berdi. Keyinroq qayta urinib ko'ring.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    await ctx.reply('✅ Hisobingiz topildi.', Markup.removeKeyboard());
    await deliver(ctx, students);
  });

  scene.action(/^stmt_pick:(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (ctx.session.step !== 1 || ctx.session.processing) return;
    const studentId = Number(ctx.match[1]);
    const offered = (ctx.session.data?.ids ?? []) as number[];
    if (!offered.includes(studentId)) return;

    // Re-read the link: it may have moved since the names were offered.
    const student = await studentOfChat(
      prisma,
      String(ctx.chat!.id),
      studentId,
    );
    if (!student) {
      await ctx.reply("O'quvchi topilmadi. Qayta /start bosing.");
      await ctx.scene.leave();
      return;
    }
    await withProcessingLock(ctx, () => send(ctx, student));
    await ctx.scene.leave();
  });

  scene.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    if (text === '/cancel' || text.startsWith('/start')) {
      await ctx.scene.leave();
      await ctx.reply(
        'Bekor qilindi. Qayta boshlash uchun /start bosing.',
        Markup.removeKeyboard(),
      );
      return;
    }
    if (ctx.session.step === 2) {
      await ctx.reply(
        'Iltimos, telefon raqamingizni quyidagi tugma orqali yuboring:',
        CONTACT_KEYBOARD,
      );
    }
  });

  return scene;
}
