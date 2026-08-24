import { Logger } from '@nestjs/common';
import { Scenes, Markup, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { BotContext } from '../types/context';
import { SCENES } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { EntityHistoryService } from '../../common/entity-history';
import {
  checkThrottle,
  findStudentByChatId,
  findStudentByPhone,
  formatRetryAfter,
  linkChatIdToStudent,
  PortalAccountMissingError,
  resetPassword,
  UserNotResettableError,
} from '../flows/password-reset-flow';

/**
 * Forgot-password flow over Telegram:
 *   step 1 → confirm reset (student is already linked via telegramChatId)
 *   step 2 → wait for contact share (student not yet linked)
 *
 * On confirmation a new random password is generated, the User record is
 * updated, an audit entry is written, and the plain password is delivered
 * to the chat with `protect_content` so it cannot be forwarded. The chat
 * message is auto-deleted after 5 minutes.
 */
export function createPasswordResetScene(
  prisma: PrismaService,
  redis: RedisService,
  entityHistoryService: EntityHistoryService,
  _bot: Telegraf<BotContext>,
): Scenes.BaseScene<BotContext> {
  const logger = new Logger('PasswordResetScene');
  const scene = new Scenes.BaseScene<BotContext>(SCENES.PASSWORD_RESET);

  scene.enter(async (ctx) => {
    const chatId = String(ctx.chat!.id);
    ctx.session.data = {};
    ctx.session.step = 0;

    const student = await findStudentByChatId(prisma, chatId);
    if (student) {
      ctx.session.data.studentId = student.id;
      ctx.session.step = 1;
      await promptConfirm(ctx, student.firstName);
      return;
    }

    ctx.session.step = 2;
    await ctx.reply(
      "Sizning Telegram hisobingiz hali tizimga bog'lanmagan.\n\n" +
        'Davom etish uchun telefon raqamingizni quyidagi tugma orqali yuboring:',
      Markup.keyboard([
        [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
      ])
        .resize()
        .oneTime(),
    );
  });

  scene.on(message('contact'), async (ctx) => {
    if (ctx.session.step !== 2) return;
    if (ctx.session.processing) return;

    const chatId = String(ctx.chat.id);
    const contact = ctx.message.contact;

    // Telegram only lets a user share their OWN contact through this button —
    // we still defensively check that the contact's user_id matches the chat
    // owner so a forwarded contact card cannot impersonate another user.
    if (contact.user_id && contact.user_id !== ctx.from?.id) {
      await ctx.reply(
        "Iltimos, faqat o'zingizning telefon raqamingizni ulashing.",
        Markup.removeKeyboard(),
      );
      return;
    }

    let phone = contact.phone_number.replace(/\D/g, '');
    if (phone.startsWith('998')) {
      phone = phone.slice(3);
    }

    if (phone.length !== 9) {
      await ctx.reply(
        "Telefon raqam noto'g'ri formatda. Qayta urinib ko'ring.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    const student = await findStudentByPhone(prisma, phone);
    if (!student) {
      await ctx.reply(
        "Bu telefon raqam tizimda topilmadi. Administrator bilan bog'laning.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    try {
      await linkChatIdToStudent(prisma, student.id, chatId);
    } catch (error) {
      logger.error('linkChatIdToStudent failed', error as Error);
      await ctx.reply(
        "Xatolik yuz berdi. Keyinroq qayta urinib ko'ring.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }

    ctx.session.data.studentId = student.id;
    ctx.session.step = 1;
    await ctx.reply('✅ Hisobingiz topildi.', Markup.removeKeyboard());
    await promptConfirm(ctx, student.firstName);
  });

  scene.action('pwd_reset_confirm', async (ctx) => {
    if (ctx.session.step !== 1) return;
    if (ctx.session.processing) return;
    ctx.session.processing = true;
    await ctx.answerCbQuery();

    const studentId = ctx.session.data?.studentId as number | undefined;
    if (!studentId) {
      ctx.session.processing = false;
      await ctx.reply('Sessiya muddati tugadi. Qayta /start bosing.');
      await ctx.scene.leave();
      return;
    }

    const throttle = await checkThrottle(redis, studentId);
    if (!throttle.allowed) {
      ctx.session.processing = false;
      const wait = formatRetryAfter(throttle.retryAfterSec);
      const msg =
        throttle.reason === 'cooldown'
          ? `Iltimos, ${wait} kutib turing.`
          : `Bugungi parol tiklash limitiga yetdingiz. ${wait} dan keyin qayta urinib ko'ring.`;
      await ctx.editMessageText(`⏳ ${msg}`);
      await ctx.scene.leave();
      return;
    }

    // Re-fetch to make sure the student still exists and is not deleted.
    const student = await prisma.student.findFirst({
      where: { id: studentId, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        userId: true,
        companyId: true,
      },
    });
    if (!student) {
      ctx.session.processing = false;
      await ctx.editMessageText(
        "O'quvchi topilmadi. Administrator bilan bog'laning.",
      );
      await ctx.scene.leave();
      return;
    }

    try {
      const { plainPassword } = await resetPassword(
        prisma,
        entityHistoryService,
        redis,
        student,
      );

      await ctx.editMessageText('✅ Parolingiz yangilandi.');

      const sent = await ctx.reply(
        "🔐 Yangi kirish ma'lumotlari:\n\n" +
          `📱 Telefon: +998 ${student.phone}\n` +
          `🔑 Yangi parol: <code>${plainPassword}</code>\n\n` +
          'student.dafzentrum.uz saytiga shu parol bilan kiring va ' +
          "xohlasangiz Sozlamalar bo'limidan o'zgartiring.\n\n" +
          "⚠️ Bu xabar 5 daqiqadan keyin avtomatik o'chiriladi.",
        { parse_mode: 'HTML', protect_content: true },
      );

      // Best-effort auto-delete: the user has already received the password,
      // so failure here is not fatal. Telegram rejects deleteMessage after
      // 48h but we only wait 5 minutes.
      const messageId = sent.message_id;
      const chatId = ctx.chat!.id;
      setTimeout(
        () => {
          ctx.telegram.deleteMessage(chatId, messageId).catch(() => {});
        },
        5 * 60 * 1000,
      ).unref?.();
    } catch (error) {
      if (error instanceof PortalAccountMissingError) {
        await ctx.editMessageText(
          "Sizning portal hisobingiz hali yaratilmagan. Administrator bilan bog'laning.",
        );
      } else if (error instanceof UserNotResettableError) {
        await ctx.editMessageText(
          "Hisobingiz vaqtincha bloklangan. Administrator bilan bog'laning.",
        );
      } else {
        logger.error('Password reset failed', error as Error);
        await ctx.editMessageText(
          "Parolni tiklashda xatolik yuz berdi. Keyinroq qayta urinib ko'ring.",
        );
      }
    } finally {
      ctx.session.processing = false;
      await ctx.scene.leave();
    }
  });

  scene.action('pwd_reset_cancel', async (ctx) => {
    if (ctx.session.processing) return;
    await ctx.answerCbQuery();
    await ctx.editMessageText('Bekor qilindi.');
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
        Markup.keyboard([
          [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
        ])
          .resize()
          .oneTime(),
      );
    }
  });

  return scene;
}

async function promptConfirm(ctx: BotContext, firstName: string) {
  await ctx.reply(
    `Salom, ${firstName}!\n\nYangi parol yaratamizmi? ` +
      'Eski parol ishlamay qoladi.',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Ha, parolni tiklash', 'pwd_reset_confirm'),
        Markup.button.callback('❌ Bekor qilish', 'pwd_reset_cancel'),
      ],
    ]),
  );
}
