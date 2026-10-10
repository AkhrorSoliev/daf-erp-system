import { Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';
import { STAFF_LINKED, STAFF_LINK_AMBIGUOUS } from '../staff/staff-link.scene';
import { linkStaffChatByPhone } from '../staff/staff-link';
import {
  linkChat,
  studentsForChat,
  studentsForPhone,
} from '../flows/statement-flow';
import {
  ACCOUNT_ALREADY_LINKED,
  ACCOUNT_LINK_NOT_FOUND,
  ACCOUNT_LINK_PROMPT,
  chatHasAccount,
  createAccountLinkScene,
  studentsLinkedText,
} from './account-link.scene';

jest.mock('../staff/staff-link', () => ({ linkStaffChatByPhone: jest.fn() }));
jest.mock('../flows/statement-flow', () => ({
  linkChat: jest.fn(),
  studentsForChat: jest.fn(),
  studentsForPhone: jest.fn(),
}));
const linkStaff = linkStaffChatByPhone as jest.Mock;
const link = linkChat as jest.Mock;
const forChat = studentsForChat as jest.Mock;
const forPhone = studentsForPhone as jest.Mock;

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'test-bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

const CHAT = 700000001;
const ME = 700000001;
const DOSTON = {
  id: 30401,
  firstName: 'Doston',
  roleIds: [4],
  portal: 'lehrer',
};
const ALI = { id: 30501, firstName: 'Ali', lastName: 'Valiyev', companyId: 1 };
const VALI = {
  id: 30502,
  firstName: 'Vali',
  lastName: 'Valiyev',
  companyId: 1,
};

function withCtx(update: Record<string, unknown>, session: any) {
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = session;
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

const enterCtx = (chatType = 'private') =>
  withCtx(
    {
      update_id: 1,
      callback_query: {
        id: '1',
        chat_instance: '1',
        from: { id: ME, is_bot: false, first_name: 'Ali' },
        message: {
          message_id: 1,
          date: 0,
          chat: { id: CHAT, type: chatType },
          text: 'menu',
        },
        data: 'menu_link',
      },
    },
    { step: 0, data: {}, processing: false },
  );

const contactCtx = (contact: Record<string, unknown>) =>
  withCtx(
    {
      update_id: 2,
      message: {
        message_id: 2,
        date: 0,
        chat: { id: CHAT, type: 'private' },
        from: { id: ME, is_bot: false, first_name: 'Ali' },
        contact,
      },
    },
    { step: 1, data: {}, processing: false },
  );

const OWN = { phone_number: '+998901234567', first_name: 'A', user_id: ME };

describe("account-link scene («📱 Hisobimni bog'lash»)", () => {
  let cabinet: { staffForChat: jest.Mock; resetButton: jest.Mock };
  let showMenu: jest.Mock;
  const history = { recordUpdate: jest.fn() };
  const prisma = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();
    cabinet = {
      staffForChat: jest.fn().mockResolvedValue(null),
      resetButton: jest.fn().mockResolvedValue(undefined),
    };
    showMenu = jest.fn().mockResolvedValue(undefined);
    forChat.mockResolvedValue([]);
    forPhone.mockResolvedValue([]);
    linkStaff.mockResolvedValue({ kind: 'not_found' });
  });

  const run = async (ctx: any) => {
    const scene = createAccountLinkScene(prisma, history, cabinet, showMenu);
    if (ctx.session.step === 0) {
      await (scene as any).enterMiddleware()(ctx, async () => {});
    } else {
      await scene.middleware()(ctx, async () => {});
    }
  };

  describe('chatHasAccount', () => {
    it('xodim chati — bor', async () => {
      cabinet.staffForChat.mockResolvedValue(DOSTON);
      await expect(chatHasAccount(prisma, cabinet, '1')).resolves.toBe(true);
    });

    it("o'quvchi kartasiga bog'langan — bor", async () => {
      forChat.mockResolvedValue([ALI]);
      await expect(chatHasAccount(prisma, cabinet, '1')).resolves.toBe(true);
    });

    it("hech kimga bog'lanmagan — yo'q", async () => {
      await expect(chatHasAccount(prisma, cabinet, '1')).resolves.toBe(false);
    });
  });

  describe('kirish', () => {
    it("bog'lanmagan chatdan o'z raqamini so'raydi", async () => {
      const ctx = enterCtx();

      await run(ctx);

      expect(ctx.session.step).toBe(1);
      expect(ctx.reply.mock.calls[0][0]).toBe(ACCOUNT_LINK_PROMPT);
      expect(
        ctx.reply.mock.calls[0][1].reply_markup.keyboard[0][0],
      ).toMatchObject({ request_contact: true });
    });

    it("allaqachon bog'langan — kontakt so'ralmaydi", async () => {
      forChat.mockResolvedValue([ALI]);
      const ctx = enterCtx();

      await run(ctx);

      expect(ctx.reply.mock.calls[0][0]).toBe(ACCOUNT_ALREADY_LINKED);
      expect(ctx.scene.leave).toHaveBeenCalled();
      expect(ctx.session.step).toBe(0);
    });

    it("guruhda bog'lamaydi", async () => {
      const ctx = enterCtx('group');

      await run(ctx);

      expect(ctx.scene.leave).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('kontakt', () => {
    it("begona kontaktni rad etadi — hech narsa bog'lanmaydi", async () => {
      const ctx = contactCtx({ ...OWN, user_id: 123 });

      await run(ctx);

      expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
      expect(linkStaff).not.toHaveBeenCalled();
      expect(link).not.toHaveBeenCalled();
    });

    it("raqamdagi hamma o'quvchi kartasini bog'laydi (aka-uka), so'ng menyu", async () => {
      forPhone.mockResolvedValue([ALI, VALI]);
      const ctx = contactCtx(OWN);

      await run(ctx);

      expect(forPhone).toHaveBeenCalledWith(prisma, '901234567');
      expect(link).toHaveBeenCalledWith(
        prisma,
        [ALI.id, VALI.id],
        String(CHAT),
      );
      expect(ctx.reply.mock.calls[0][0]).toBe(
        studentsLinkedText(['Ali Valiyev', 'Vali Valiyev']),
      );
      expect(showMenu).toHaveBeenCalledWith(ctx);
      expect(ctx.scene.leave).toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it("xodim hisobini bog'laydi, eski chatning tugmasi qaytariladi", async () => {
      linkStaff.mockResolvedValue({
        kind: 'linked',
        account: DOSTON,
        previousChatId: '600000009',
      });
      const ctx = contactCtx(OWN);

      await run(ctx);

      expect(linkStaff).toHaveBeenCalledWith(
        prisma,
        history,
        String(CHAT),
        '901234567',
      );
      expect(ctx.reply.mock.calls[0][0]).toBe(STAFF_LINKED);
      expect(cabinet.resetButton).toHaveBeenCalledWith('600000009');
      expect(link).not.toHaveBeenCalled();
      expect(showMenu).toHaveBeenCalledWith(ctx);
    });

    it('chet el raqami ham kod bilan qidiriladi', async () => {
      await run(contactCtx({ ...OWN, phone_number: '+79161234567' }));

      expect(forPhone).toHaveBeenCalledWith(prisma, '79161234567');
    });

    it("raqam hech qayerda yo'q — tushuntirish, hech narsa yaratilmaydi", async () => {
      const ctx = contactCtx(OWN);

      await run(ctx);

      expect(ctx.reply.mock.calls[0][0]).toBe(ACCOUNT_LINK_NOT_FOUND);
      expect(link).not.toHaveBeenCalled();
      expect(showMenu).not.toHaveBeenCalled();
    });

    it("raqam bir nechta xodim hisobida — rad, menyu yo'q", async () => {
      linkStaff.mockResolvedValue({ kind: 'ambiguous' });
      const ctx = contactCtx(OWN);

      await run(ctx);

      expect(ctx.reply.mock.calls[0][0]).toBe(STAFF_LINK_AMBIGUOUS);
      expect(showMenu).not.toHaveBeenCalled();
    });

    it("bazada xato — xabar, qulf bo'shaydi, menyu yo'q", async () => {
      linkStaff.mockRejectedValue(new Error('Connection terminated'));
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const ctx = contactCtx(OWN);

      await run(ctx);
      error.mockRestore();

      expect(ctx.reply.mock.calls[0][0]).toMatch(/Xatolik/);
      expect(ctx.session.processing).toBe(false);
      expect(showMenu).not.toHaveBeenCalled();
    });
  });
});
