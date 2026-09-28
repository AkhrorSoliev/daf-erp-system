import { Logger } from '@nestjs/common';
import { Markup, Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import type { EntityHistoryService } from '../../common/entity-history';
import {
  normalizeSharedPhone,
  SHARED_PHONE_INVALID,
} from '../../common/utils/phone.util';
import type { PrismaService } from '../../prisma/prisma.service';
import { SCENES } from '../constants';
import type { BotContext } from '../types/context';
import {
  CONTACT_NOT_OWN,
  contactBelongsToSender,
} from '../utils/contact-ownership';
import { withProcessingLock } from '../utils/processing-lock';
import type { StaffCabinet } from './staff-cabinet';
import { linkStaffChatByPhone } from './staff-link';

/** `t.me/<bot>?start=xodim` — xodim Telegram'ini hisobiga bog'lash (ADR-0045). */
export const STAFF_LINK_PAYLOAD = 'xodim';

const CONTACT_KEYBOARD = Markup.keyboard([
  [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
])
  .resize()
  .oneTime();

export const STAFF_LINK_PROMPT =
  "Xodim hisobingizni Telegram'ga bog'lash uchun telefon raqamingizni quyidagi tugma orqali yuboring.\n\n" +
  "Raqam tizimdagi xodim hisobingizdagi raqam bilan bir xil bo'lishi kerak.";

export const STAFF_LINK_NOT_FOUND =
  'Bu raqam bilan xodim hisobi topilmadi.\n\n' +
  "Tizimdagi raqamingiz Telegram raqamingizdan boshqa bo'lsa, administrator " +
  "hisobingizdagi raqamni Telegram raqamingizga almashtirib beradi — so'ng " +
  "qayta urinib ko'ring.";

export const STAFF_LINK_AMBIGUOUS =
  "Bu raqam bir nechta xodim hisobiga tegishli. Administrator bilan bog'laning.";

export const STAFF_LINKED = "✅ Telegram'ingiz xodim hisobingizga bog'landi.";

const STAFF_ALREADY_LINKED =
  "Telegram'ingiz xodim hisobingizga allaqachon bog'langan.";

/**
 * Xodim Telegram'ini hisobiga bog'lash (ADR-0045):
 *   enter → chat allaqachon xodimniki bo'lsa — xodim menyusi; aks holda
 *           kontakt so'raladi (step 1)
 *   contact → o'z raqami + hisobdagi telefon → bog'lanish → xodim menyusi
 *
 * Bot orqali ro'yxatdan o'tgan xodim bog'langan bo'ladi; admin panelda
 * qo'shilgan xodim shu yo'l bilan bog'lanadi.
 */
export function createStaffLinkScene(
  prisma: Pick<PrismaService, 'user' | '$transaction'>,
  history: Pick<EntityHistoryService, 'recordUpdate'>,
  cabinet: Pick<StaffCabinet, 'staffForChat' | 'showMenu' | 'resetButton'>,
): Scenes.BaseScene<BotContext> {
  const logger = new Logger('StaffLinkScene');
  const scene = new Scenes.BaseScene<BotContext>(SCENES.STAFF_LINK);

  scene.enter(async (ctx) => {
    ctx.session.data = {};
    ctx.session.step = 0;
    // Kontakt tugmasi faqat shaxsiy chatda — guruhda bog'lanmaydi.
    if (ctx.chat?.type !== 'private') {
      await ctx.scene.leave();
      return;
    }

    const account = await cabinet.staffForChat(String(ctx.chat.id));
    if (account) {
      await ctx.scene.leave();
      if (!(await cabinet.showMenu(ctx, account))) {
        await ctx.reply(STAFF_ALREADY_LINKED, Markup.removeKeyboard());
      }
      return;
    }

    ctx.session.step = 1;
    await ctx.reply(STAFF_LINK_PROMPT, CONTACT_KEYBOARD);
  });

  scene.on(message('contact'), async (ctx) => {
    if (ctx.session.step !== 1 || ctx.session.processing) return;
    const contact = ctx.message.contact;

    // Faqat odamning O'Z, Telegram tasdiqlagan raqami: begona kontakt bilan
    // begonaning xodim hisobini o'ziga bog'lab, parolsiz kirib bo'lardi.
    if (!contactBelongsToSender(contact, ctx.from)) {
      await ctx.reply(CONTACT_NOT_OWN, CONTACT_KEYBOARD);
      return;
    }

    const phone = normalizeSharedPhone(contact.phone_number);
    if (!phone) {
      await ctx.reply(SHARED_PHONE_INVALID, CONTACT_KEYBOARD);
      return;
    }

    const chatId = String(ctx.chat.id);
    await withProcessingLock(ctx, async () => {
      let result: Awaited<ReturnType<typeof linkStaffChatByPhone>>;
      try {
        result = await linkStaffChatByPhone(prisma, history, chatId, phone);
      } catch (error) {
        logger.error(
          `Xodim Telegram'ini bog'lab bo'lmadi (chat ${chatId})`,
          error as Error,
        );
        await ctx.reply(
          "Xatolik yuz berdi. Keyinroq qayta urinib ko'ring.",
          Markup.removeKeyboard(),
        );
        await ctx.scene.leave();
        return;
      }

      await ctx.scene.leave();
      if (result.kind === 'not_found') {
        await ctx.reply(STAFF_LINK_NOT_FOUND, Markup.removeKeyboard());
        return;
      }
      if (result.kind === 'ambiguous') {
        await ctx.reply(STAFF_LINK_AMBIGUOUS, Markup.removeKeyboard());
        return;
      }

      // Hisob boshqa Telegram'dan ko'chdi: eski chatning «Kabinet»i endi
      // xodim kabinetini ochmasin.
      if (result.previousChatId) {
        await cabinet.resetButton(result.previousChatId);
      }
      await ctx.reply(STAFF_LINKED, Markup.removeKeyboard());
      await cabinet.showMenu(ctx, result.account);
    });
  });

  scene.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    if (text === '/cancel') {
      await ctx.scene.leave();
      await ctx.reply(
        'Bekor qilindi. Qayta boshlash uchun /start bosing.',
        Markup.removeKeyboard(),
      );
      return;
    }
    if (ctx.session.step === 1) {
      await ctx.reply(
        'Iltimos, telefon raqamingizni quyidagi tugma orqali yuboring:',
        CONTACT_KEYBOARD,
      );
    }
  });

  return scene;
}
