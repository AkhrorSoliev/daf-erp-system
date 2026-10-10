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
import {
  linkChat,
  studentsForChat,
  studentsForPhone,
} from '../flows/statement-flow';
import type { StaffCabinet } from '../staff/staff-cabinet';
import { linkStaffChatByPhone } from '../staff/staff-link';
import { STAFF_LINK_AMBIGUOUS, STAFF_LINKED } from '../staff/staff-link.scene';
import type { BotContext } from '../types/context';
import {
  CONTACT_NOT_OWN,
  contactBelongsToSender,
} from '../utils/contact-ownership';
import { withProcessingLock } from '../utils/processing-lock';

/** The /start menu button, shown only in a private chat linked to nobody. */
export const ACCOUNT_LINK_BUTTON = "📱 Hisobimni bog'lash";
export const ACCOUNT_LINK_ACTION = 'menu_link';

export const ACCOUNT_LINK_PROMPT =
  "Telegram'ingizni hisobingizga bog'lash uchun telefon raqamingizni quyidagi tugma orqali yuboring.\n\n" +
  "Raqam tizimdagi raqamingiz bilan bir xil bo'lishi kerak.";

export const ACCOUNT_LINK_NOT_FOUND =
  'Bu raqam tizimda topilmadi.\n\n' +
  "Tizimdagi raqamingiz Telegram raqamingizdan boshqa bo'lsa, administrator bilan bog'laning.";

export const ACCOUNT_ALREADY_LINKED =
  "Telegram'ingiz hisobingizga allaqachon bog'langan.";

export const studentsLinkedText = (names: string[]) =>
  `✅ Telegram'ingiz bog'landi: ${names.join(', ')}.`;

const CONTACT_KEYBOARD = Markup.keyboard([
  [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
])
  .resize()
  .oneTime();

type LinkCabinet = Pick<StaffCabinet, 'staffForChat' | 'resetButton'>;

/** Whether the chat is linked to a student card or a staff account. */
export async function chatHasAccount(
  prisma: PrismaService,
  cabinet: Pick<StaffCabinet, 'staffForChat'>,
  chatId: string,
): Promise<boolean> {
  if (await cabinet.staffForChat(chatId)) return true;
  return (await studentsForChat(prisma, chatId)).length > 0;
}

/**
 * «📱 Hisobimni bog'lash»: a student or staff member added by an administrator
 * presses /start and sends their own number; the chat is linked to whichever
 * account holds it.
 *   staff — the /xodim path (ADR-0045): linked when exactly one account matches;
 *   students — the «💳 To'lovlar» path: every card on the number (siblings).
 * Only the sender's own contact is accepted. The phone is not proved
 * (ADR-0039); login and password do not change.
 */
export function createAccountLinkScene(
  prisma: PrismaService,
  history: Pick<EntityHistoryService, 'recordUpdate'>,
  cabinet: LinkCabinet,
  showMenu: (ctx: BotContext) => Promise<void>,
): Scenes.BaseScene<BotContext> {
  const logger = new Logger('AccountLinkScene');
  const scene = new Scenes.BaseScene<BotContext>(SCENES.ACCOUNT_LINK);

  scene.enter(async (ctx) => {
    ctx.session.data = {};
    ctx.session.step = 0;
    // The contact button works only in a private chat.
    if (ctx.chat?.type !== 'private') {
      await ctx.scene.leave();
      return;
    }
    if (await chatHasAccount(prisma, cabinet, String(ctx.chat.id))) {
      await ctx.scene.leave();
      await ctx.reply(ACCOUNT_ALREADY_LINKED, Markup.removeKeyboard());
      return;
    }
    ctx.session.step = 1;
    await ctx.reply(ACCOUNT_LINK_PROMPT, CONTACT_KEYBOARD);
  });

  scene.on(message('contact'), async (ctx) => {
    if (ctx.session.step !== 1 || ctx.session.processing) return;
    const contact = ctx.message.contact;

    // A stranger's contact must not link a stranger's account.
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
    let linked = false;
    await withProcessingLock(ctx, async () => {
      await ctx.scene.leave();
      try {
        const staff = await linkStaffChatByPhone(
          prisma,
          history,
          chatId,
          phone,
        );
        const students = await studentsForPhone(prisma, phone);
        if (students.length > 0) {
          await linkChat(
            prisma,
            students.map((s) => s.id),
            chatId,
          );
        }

        const lines: string[] = [];
        if (staff.kind === 'linked') lines.push(STAFF_LINKED);
        if (students.length > 0) {
          lines.push(
            studentsLinkedText(
              students.map((s) => `${s.firstName} ${s.lastName}`.trim()),
            ),
          );
        }
        if (staff.kind === 'ambiguous') lines.push(STAFF_LINK_AMBIGUOUS);
        if (lines.length === 0) lines.push(ACCOUNT_LINK_NOT_FOUND);
        await ctx.reply(lines.join('\n\n'), Markup.removeKeyboard());

        // The account moved from another chat: give that chat its default button back.
        if (staff.kind === 'linked' && staff.previousChatId) {
          await cabinet.resetButton(staff.previousChatId);
        }
        linked = staff.kind === 'linked' || students.length > 0;
      } catch (error) {
        logger.error(
          `Telegram'ni hisobga bog'lab bo'lmadi (chat ${chatId})`,
          error as Error,
        );
        await ctx.reply(
          "Xatolik yuz berdi. Keyinroq qayta urinib ko'ring.",
          Markup.removeKeyboard(),
        );
      }
    });
    // A linked chat gets its own menu: the staff menu or the student menu.
    if (linked) await showMenu(ctx);
  });

  scene.on(message('text'), async (ctx) => {
    if (ctx.message.text.trim() === '/cancel') {
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
