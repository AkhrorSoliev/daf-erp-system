import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import {
  branchChoices,
  createLeadFromTest,
  saveAttempt,
  seenQuestionIds,
} from '../../level-test/level-test.store';
import {
  LEVEL_TEST_BRANCH_PROMPT,
  LEVEL_TEST_LATER_BUTTON,
  LEVEL_TEST_LATER_REPLY,
  LEVEL_TEST_LEAD_DONE,
  LEVEL_TEST_PHONE_PROMPT,
  LEVEL_TEST_STALE,
} from '../../level-test/level-test.texts';
import {
  LEVEL_TEST_LEVELS,
  type LevelTestQuestion,
} from '../../level-test/level-test.types';
import { DEFAULT_COMPANY_ID } from '../constants';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';
import {
  GRACE_SECONDS,
  MAX_TIMEOUTS_IN_ROW,
  SECONDS_PER_LEVEL,
} from '../../level-test/level-test.logic';
import {
  LEVEL_TEST_ABANDONED,
  LEVEL_TEST_TIMEOUT_NOTE,
} from '../../level-test/level-test.texts';
import {
  createLevelTestScene,
  levelTestTimeoutUpdate,
} from './level-test.scene';

jest.mock('../../level-test/level-test.store', () => ({
  branchChoices: jest.fn(),
  createLeadFromTest: jest.fn(),
  saveAttempt: jest.fn(),
  seenQuestionIds: jest.fn(),
}));
const seen = seenQuestionIds as jest.Mock;
const save = saveAttempt as jest.Mock;
const branches = branchChoices as jest.Mock;
const makeLead = createLeadFromTest as jest.Mock;

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

/** Daraja boshiga 6 ta savol: 5 tasi tanlanadi. */
const POOL: LevelTestQuestion[] = LEVEL_TEST_LEVELS.flatMap((level) =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `${level.toLowerCase()}-${i + 1}`,
    level,
    text: `${level} savol ${i + 1}`,
    correct: 'to‘g‘ri',
    wrong: ['xato 1', 'xato 2', 'xato 3'] as [string, string, string],
  })),
);

function withCtx(update: Record<string, unknown>, session: any) {
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = session;
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue({ message_id: 55 });
  ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined);
  ctx.editMessageText = jest.fn().mockResolvedValue(undefined);
  ctx.editMessageReplyMarkup = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

const chat = (type = 'private') => ({ id: CHAT, type });
const from = { id: ME, is_bot: false, first_name: 'Ali' };

const callbackCtx = (data: string, session: any) =>
  withCtx(
    {
      update_id: 1,
      callback_query: {
        id: '1',
        chat_instance: '1',
        from,
        message: { message_id: 1, date: 0, chat: chat(), text: 'x' },
        data,
      },
    },
    session,
  );

const textCtx = (text: string, session: any) =>
  withCtx(
    {
      update_id: 2,
      message: { message_id: 2, date: 0, chat: chat(), from, text },
    },
    session,
  );

const contactCtx = (contact: Record<string, unknown>, session: any) =>
  withCtx(
    {
      update_id: 3,
      message: { message_id: 3, date: 0, chat: chat(), from, contact },
    },
    session,
  );

const OWN = { phone_number: '+998901234567', first_name: 'Ali', user_id: ME };

describe('level-test scene («📊 Darajani aniqlash»)', () => {
  const history = { recordCreate: jest.fn() };
  const prisma = {} as any;
  let session: any;
  let clock: number;
  const schedule = jest.fn();
  const scene = () =>
    createLevelTestScene(prisma, history, POOL, () => 0.5, {
      now: () => clock,
      schedule,
    });
  /** Savol ko'rsatilgandan keyin `seconds` soniya o'tdi. */
  const wait = (seconds: number) => {
    clock += seconds * 1000;
  };
  const timeoutTick = async (counter: number) => {
    const ctx = withCtx(
      levelTestTimeoutUpdate(CHAT, counter, 55, clock) as any,
      session,
    );
    await scene().middleware()(ctx, async () => {});
    return ctx;
  };

  const enter = async (type = 'private') => {
    const ctx = withCtx(
      {
        update_id: 0,
        callback_query: {
          id: '0',
          chat_instance: '1',
          from,
          message: { message_id: 1, date: 0, chat: chat(type), text: 'menu' },
          data: 'menu_level',
        },
      },
      session,
    );
    await (scene() as any).enterMiddleware()(ctx, async () => {});
    return ctx;
  };

  const answer = async (right: boolean, counterOverride?: number) => {
    const lt = session.data.lt;
    const wrongIdx = lt.current.options.findIndex(
      (_: string, i: number) => i !== lt.current.correctIndex,
    );
    const idx = right ? lt.current.correctIndex : wrongIdx;
    const ctx = callbackCtx(
      `lt:${counterOverride ?? lt.counter}:${idx}`,
      session,
    );
    await scene().middleware()(ctx, async () => {});
    return ctx;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clock = 1_000_000;
    session = { step: 0, data: {}, processing: false };
    seen.mockResolvedValue(new Set());
    save.mockResolvedValue('att-1');
    branches.mockResolvedValue([
      { id: 1, name: 'Farg‘ona' },
      { id: 2, name: 'Namangan' },
    ]);
    makeLead.mockResolvedValue({ kind: 'created', leadId: 'L1' });
  });

  it('guruhda boshlamaydi', async () => {
    const ctx = await enter('group');
    expect(ctx.scene.leave).toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('kirishda tanishtiruv va 4 variantli birinchi savol', async () => {
    const ctx = await enter();

    expect(ctx.reply).toHaveBeenCalledTimes(2);
    const q = ctx.reply.mock.calls[1];
    expect(q[0]).toContain('Savol 1');
    expect(q[0]).toContain('A1 savol');
    const rows = q[1].reply_markup.inline_keyboard;
    expect(rows).toHaveLength(4);
    expect(rows[0][0].callback_data).toMatch(/^lt:1:\d$/);
    expect(session.data.lt.counter).toBe(1);
  });

  it("avval ko'rilgan savollarni o'tkazadi", async () => {
    seen.mockResolvedValue(new Set(['a1-1', 'a1-2']));
    await enter();
    // A1 da 6 ta savol bor, 2 tasi ko'rilgan: 4 yangi + 1 ko'rilgan.
    const asked = [session.data.lt.current.id, ...session.data.lt.queue];
    expect(asked).toHaveLength(5);
    expect(asked).toEqual(
      expect.arrayContaining(['a1-3', 'a1-4', 'a1-5', 'a1-6']),
    );
  });

  it("hammasi to'g'ri — 20 savol, natija B2, urinish saqlanadi", async () => {
    await enter();
    for (let i = 0; i < 20; i++) await answer(true);

    expect(save).toHaveBeenCalledTimes(1);
    const saved = save.mock.calls[0][1];
    expect(saved.result).toBe('B2');
    expect(saved.questionIds).toHaveLength(20);
    expect(new Set(saved.questionIds).size).toBe(20);
    expect(saved.correctByLevel).toEqual({ A1: 5, A2: 5, B1: 5, B2: 5 });
    expect(saved.companyId).toBe(DEFAULT_COMPANY_ID);
    expect(saved.chatId).toBe(String(CHAT));
    expect(session.data.lt.phase).toBe('contact');
  });

  it('A1 da 4 dan kam — test shu yerda tugaydi, BEGINNER', async () => {
    await enter();
    await answer(true);
    await answer(true);
    await answer(false);
    await answer(false);
    const last = await answer(false);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][1]).toMatchObject({
      result: 'BEGINNER',
      correctByLevel: { A1: 2 },
    });
    expect(save.mock.calls[0][1].questionIds).toHaveLength(5);
    const texts = last.reply.mock.calls.map((c: any[]) => c[0]);
    expect(texts[0]).toContain('A1 dan past');
    expect(texts[0]).toContain('2 / 5');
    expect(texts[1]).toBe(LEVEL_TEST_PHONE_PROMPT);
  });

  it("A2 dan o'tmasa natija A1", async () => {
    await enter();
    for (let i = 0; i < 5; i++) await answer(true);
    for (let i = 0; i < 5; i++) await answer(i < 3);

    expect(save.mock.calls[0][1]).toMatchObject({
      result: 'A1',
      correctByLevel: { A1: 5, A2: 3 },
    });
  });

  it('eski savolga bosish hisobga olinmaydi', async () => {
    await enter();
    await answer(true);
    const ctx = await answer(true, 1);

    expect(ctx.answerCbQuery).toHaveBeenCalledWith(LEVEL_TEST_STALE);
    expect(session.data.lt.counter).toBe(2);
    expect(session.data.lt.correct.A1).toBe(1);
  });

  it("javobdan so'ng to'g'ri javobni ko'rsatmaydi", async () => {
    await enter();
    const lt = session.data.lt;
    const chosen = lt.current.options[lt.current.options.length - 1];
    const ctx = await answer(false);

    const edited = ctx.editMessageText.mock.calls[0][0] as string;
    expect(edited).toContain('Javobingiz:');
    expect(edited).not.toContain('to‘g‘ri javob');
    expect(chosen).toBeDefined();
  });

  describe('savol vaqti', () => {
    it('savol matnida daraja vaqti turadi va taymer rejalanadi', async () => {
      const ctx = await enter();

      expect(ctx.reply.mock.calls[1][0]).toContain(
        `⏱ ${SECONDS_PER_LEVEL.A1} soniya`,
      );
      expect(schedule).toHaveBeenCalledWith({
        chatId: CHAT,
        counter: 1,
        messageId: 55,
        delayMs: (SECONDS_PER_LEVEL.A1 + GRACE_SECONDS) * 1000 + 500,
      });
      expect(session.data.lt.deadlineAt).toBe(
        clock + SECONDS_PER_LEVEL.A1 * 1000,
      );
    });

    it("muddat ichida (kechikish muhlatida ham) berilgan javob o'tadi", async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS);
      const ctx = await answer(true);

      expect(session.data.lt.correct.A1).toBe(1);
      expect(ctx.editMessageText.mock.calls[0][0]).toContain('Javobingiz');
    });

    it('muddatdan keyingi bosish — vaqt tugadi: javob hisobga olinmay, keyingi savol', async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
      const ctx = await answer(true);

      expect(session.data.lt.correct.A1).toBe(0);
      expect(ctx.answerCbQuery).toHaveBeenCalledWith(LEVEL_TEST_TIMEOUT_NOTE);
      expect(ctx.editMessageText.mock.calls[0][0]).toContain(
        LEVEL_TEST_TIMEOUT_NOTE,
      );
      expect(session.data.lt.counter).toBe(2);
      expect(ctx.reply.mock.calls[0][0]).toContain('Savol 2');
    });

    it("taymer yangilanishi muddat o'tgach savolni yopadi va keyingisini beradi", async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
      const ctx = await timeoutTick(1);

      expect(session.data.lt.correct.A1).toBe(0);
      expect(session.data.lt.timeoutsInRow).toBe(1);
      expect(ctx.answerCbQuery).not.toHaveBeenCalled();
      expect(ctx.editMessageText.mock.calls[0][0]).toContain(
        LEVEL_TEST_TIMEOUT_NOTE,
      );
      expect(session.data.lt.counter).toBe(2);
      expect(schedule).toHaveBeenCalledTimes(2);
    });

    it("muddat hali o'tmagan bo'lsa, taymer yangilanishi e'tiborsiz", async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1);
      await timeoutTick(1);

      expect(session.data.lt.counter).toBe(1);
      expect(session.data.lt.current).not.toBeNull();
    });

    it("javob berilgan savolning eski taymeri hech narsani o'zgartirmaydi", async () => {
      await enter();
      await answer(true);
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
      await timeoutTick(1);

      expect(session.data.lt.counter).toBe(2);
      expect(session.data.lt.timeoutsInRow).toBe(0);
      expect(session.data.lt.correct.A1).toBe(1);
    });

    it("boshqa yangilanish ishlayotgan bo'lsa, taymer aralashmaydi", async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
      session.processing = true;
      await timeoutTick(1);

      expect(session.data.lt.counter).toBe(1);
    });

    it('javob berilsa ketma-ket javobsizlik hisobi nolga qaytadi', async () => {
      await enter();
      for (let i = 0; i < MAX_TIMEOUTS_IN_ROW - 1; i++) {
        wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
        await timeoutTick(session.data.lt.counter);
      }
      expect(session.data.lt.timeoutsInRow).toBe(MAX_TIMEOUTS_IN_ROW - 1);

      await answer(true);

      expect(session.data.lt.timeoutsInRow).toBe(0);
    });

    it("ketma-ket 3 ta javobsiz savoldan keyin test to'xtatiladi va saqlanmaydi", async () => {
      await enter();
      let last: any;
      for (let i = 0; i < MAX_TIMEOUTS_IN_ROW; i++) {
        wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
        last = await timeoutTick(session.data.lt.counter);
      }

      expect(last.scene.leave).toHaveBeenCalled();
      expect(last.reply.mock.calls[0][0]).toBe(LEVEL_TEST_ABANDONED);
      expect(save).not.toHaveBeenCalled();
    });

    it("yuqori darajada vaqt ko'proq", async () => {
      await enter();
      for (let i = 0; i < 5; i++) await answer(true);

      expect(session.data.lt.current.level).toBe('A2');
      expect(session.data.lt.deadlineAt).toBe(
        clock + SECONDS_PER_LEVEL.A2 * 1000,
      );
    });
  });

  describe('natijadan keyin', () => {
    const finishFailing = async () => {
      await enter();
      for (let i = 0; i < 5; i++) await answer(false);
    };

    it('begona kontaktni rad etadi — lid ochilmaydi', async () => {
      await finishFailing();
      const ctx = contactCtx({ ...OWN, user_id: 999 }, session);
      await scene().middleware()(ctx, async () => {});

      expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
      expect(makeLead).not.toHaveBeenCalled();
    });

    it("ikki filial — filial so'raydi, tanlagach lid ochadi", async () => {
      await finishFailing();
      const ctx = contactCtx(OWN, session);
      await scene().middleware()(ctx, async () => {});

      expect(ctx.reply.mock.calls[0][0]).toBe(LEVEL_TEST_BRANCH_PROMPT);
      const rows = ctx.reply.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(rows.map((r: any[]) => r[0].callback_data)).toEqual([
        'ltb:1',
        'ltb:2',
      ]);
      expect(makeLead).not.toHaveBeenCalled();

      const pick = callbackCtx('ltb:2', session);
      await scene().middleware()(pick, async () => {});

      expect(makeLead).toHaveBeenCalledWith(
        prisma,
        history,
        expect.objectContaining({
          attemptId: 'att-1',
          phone: '901234567',
          branchId: 2,
          firstName: 'Ali',
          companyId: DEFAULT_COMPANY_ID,
          result: 'BEGINNER',
        }),
      );
      expect(pick.reply.mock.calls[0][0]).toBe(LEVEL_TEST_LEAD_DONE);
      expect(pick.scene.leave).toHaveBeenCalled();
    });

    it("ro'yxatda yo'q filialni tanlab bo'lmaydi", async () => {
      await finishFailing();
      await scene().middleware()(contactCtx(OWN, session), async () => {});

      const pick = callbackCtx('ltb:77', session);
      await scene().middleware()(pick, async () => {});

      expect(pick.answerCbQuery).toHaveBeenCalledWith(LEVEL_TEST_STALE);
      expect(makeLead).not.toHaveBeenCalled();
    });

    it("bitta filial — so'ramasdan lid ochadi", async () => {
      branches.mockResolvedValue([{ id: 5, name: 'Yagona' }]);
      await finishFailing();
      const ctx = contactCtx(OWN, session);
      await scene().middleware()(ctx, async () => {});

      expect(makeLead).toHaveBeenCalledWith(
        prisma,
        history,
        expect.objectContaining({ branchId: 5 }),
      );
      expect(ctx.reply.mock.calls[0][0]).toBe(LEVEL_TEST_LEAD_DONE);
    });

    it('«Keyinroq» — lid ochilmaydi, test natijasi saqlangan qoladi', async () => {
      await finishFailing();
      const ctx = textCtx(LEVEL_TEST_LATER_BUTTON, session);
      await scene().middleware()(ctx, async () => {});

      expect(ctx.reply.mock.calls[0][0]).toBe(LEVEL_TEST_LATER_REPLY);
      expect(ctx.scene.leave).toHaveBeenCalled();
      expect(makeLead).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledTimes(1);
    });

    it("urinish saqlanmasa, telefon so'ralmaydi", async () => {
      save.mockRejectedValue(new Error('db'));
      await enter();
      let last: any;
      for (let i = 0; i < 5; i++) last = await answer(false);

      expect(last.scene.leave).toHaveBeenCalled();
      const texts = last.reply.mock.calls.map((c: any[]) => c[0]);
      expect(texts).not.toContain(LEVEL_TEST_PHONE_PROMPT);
    });
  });

  it("/cancel testni to'xtatadi", async () => {
    await enter();
    const ctx = textCtx('/cancel', session);
    await scene().middleware()(ctx, async () => {});

    expect(ctx.scene.leave).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
