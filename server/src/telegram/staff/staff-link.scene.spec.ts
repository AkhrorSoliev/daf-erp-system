import { Logger } from '@nestjs/common';
import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';
import {
  STAFF_LINKED,
  STAFF_LINK_AMBIGUOUS,
  STAFF_LINK_NOT_FOUND,
  STAFF_LINK_PROMPT,
  createStaffLinkScene,
} from './staff-link.scene';
import { linkStaffChatByPhone } from './staff-link';

jest.mock('./staff-link', () => ({ linkStaffChatByPhone: jest.fn() }));
const link = linkStaffChatByPhone as jest.Mock;

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
      message: {
        message_id: 1,
        date: 0,
        chat: { id: CHAT, type: chatType },
        from: { id: ME, is_bot: false, first_name: 'Doston' },
        text: '/xodim',
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
        from: { id: ME, is_bot: false, first_name: 'Doston' },
        contact,
      },
    },
    { step: 1, data: {}, processing: false },
  );

const OWN = { phone_number: '+998901234567', first_name: 'D', user_id: ME };

describe('staff-link scene (ADR-0045)', () => {
  let cabinet: {
    staffForChat: jest.Mock;
    showMenu: jest.Mock;
    resetButton: jest.Mock;
  };
  const history = { recordUpdate: jest.fn() };
  const prisma = {} as any;

  beforeEach(() => {
    link.mockReset();
    cabinet = {
      staffForChat: jest.fn().mockResolvedValue(null),
      showMenu: jest.fn().mockResolvedValue(true),
      resetButton: jest.fn().mockResolvedValue(undefined),
    };
  });

  const run = async (ctx: any) => {
    const scene = createStaffLinkScene(prisma, history, cabinet);
    if (ctx.session.step === 0) {
      await (scene as any).enterMiddleware()(ctx, async () => {});
    } else {
      await scene.middleware()(ctx, async () => {});
    }
  };

  describe('kirish', () => {
    it("bog'lanmagan chatdan o'z raqamini so'raydi", async () => {
      const ctx = enterCtx();

      await run(ctx);

      expect(ctx.session.step).toBe(1);
      expect(ctx.reply.mock.calls[0][0]).toBe(STAFF_LINK_PROMPT);
      expect(
        ctx.reply.mock.calls[0][1].reply_markup.keyboard[0][0],
      ).toMatchObject({ request_contact: true });
    });

    it("allaqachon xodim chati — kontakt so'ralmaydi, xodim menyusi", async () => {
      cabinet.staffForChat.mockResolvedValue(DOSTON);
      const ctx = enterCtx();

      await run(ctx);

      expect(cabinet.showMenu).toHaveBeenCalledWith(ctx, DOSTON);
      expect(ctx.scene.leave).toHaveBeenCalled();
      expect(ctx.session.step).toBe(0);
    });

    it("guruhda bog'lamaydi", async () => {
      const ctx = enterCtx('group');

      await run(ctx);

      expect(cabinet.staffForChat).not.toHaveBeenCalled();
      expect(ctx.scene.leave).toHaveBeenCalled();
      expect(ctx.reply).not.toHaveBeenCalled();
    });
  });

  describe('kontakt', () => {
    it("begona kontaktni rad etadi — bog'lashga urinilmaydi", async () => {
      const ctx = contactCtx({ ...OWN, user_id: 123 });

      await run(ctx);

      expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
      expect(link).not.toHaveBeenCalled();
    });

    it('`user_id`siz kontaktni ham rad etadi', async () => {
      const ctx = contactCtx({
        phone_number: OWN.phone_number,
        first_name: 'D',
      });

      await run(ctx);

      expect(link).not.toHaveBeenCalled();
    });

    it("o'z raqamini 9 xonaga keltirib bog'laydi, so'ng xodim menyusi", async () => {
      link.mockResolvedValue({
        kind: 'linked',
        account: DOSTON,
        previousChatId: null,
      });
      const ctx = contactCtx(OWN);

      await run(ctx);

      expect(link).toHaveBeenCalledWith(
        prisma,
        history,
        String(CHAT),
        '901234567',
      );
      expect(ctx.reply.mock.calls[0][0]).toBe(STAFF_LINKED);
      expect(cabinet.showMenu).toHaveBeenCalledWith(ctx, DOSTON);
      expect(cabinet.resetButton).not.toHaveBeenCalled();
      expect(ctx.scene.leave).toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it("hisob boshqa Telegram'dan ko'chsa — eski chatning tugmasi qaytariladi", async () => {
      link.mockResolvedValue({
        kind: 'linked',
        account: DOSTON,
        previousChatId: '600000009',
      });

      await run(contactCtx(OWN));

      expect(cabinet.resetButton).toHaveBeenCalledWith('600000009');
    });

    it.each([
      ['not_found', STAFF_LINK_NOT_FOUND],
      ['ambiguous', STAFF_LINK_AMBIGUOUS],
    ])("%s — tushuntirish, menyu yo'q", async (kind, text) => {
      link.mockResolvedValue({ kind });
      const ctx = contactCtx(OWN);

      await run(ctx);

      expect(ctx.reply.mock.calls[0][0]).toBe(text);
      expect(cabinet.showMenu).not.toHaveBeenCalled();
      expect(ctx.scene.leave).toHaveBeenCalled();
    });

    it("bazada xato — xabar, qulf bo'shaydi", async () => {
      link.mockRejectedValue(new Error('Connection terminated unexpectedly'));
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const ctx = contactCtx(OWN);

      await run(ctx);
      error.mockRestore();

      expect(ctx.reply.mock.calls[0][0]).toMatch(/Xatolik/);
      expect(ctx.session.processing).toBe(false);
      expect(ctx.scene.leave).toHaveBeenCalled();
    });
  });
});
