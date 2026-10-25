import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import {
  branchChoices,
  createLeadFromTest,
  finishAttempt,
  linkedStudent,
  recordStudentResult,
  saveProgress,
  seenQuestionIds,
  startAttempt,
} from '../../level-test/level-test.store';
import {
  LEVEL_TEST_BRANCH_PROMPT,
  LEVEL_TEST_LATER_BUTTON,
  LEVEL_TEST_LATER_REPLY,
  LEVEL_TEST_LEAD_DONE,
  LEVEL_TEST_PHONE_PROMPT,
  LEVEL_TEST_STALE,
  LEVEL_TEST_STOP_CONFIRM,
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
import { createLevelTestScene } from './level-test.scene';
import { levelTestTimeoutUpdate } from './level-test-timer';

jest.mock('../../level-test/level-test.store', () => ({
  branchChoices: jest.fn(),
  createLeadFromTest: jest.fn(),
  finishAttempt: jest.fn(),
  linkedStudent: jest.fn(),
  recordStudentResult: jest.fn(),
  saveProgress: jest.fn(),
  seenQuestionIds: jest.fn(),
  startAttempt: jest.fn(),
}));
const seen = seenQuestionIds as jest.Mock;
const save = finishAttempt as jest.Mock;
const start = startAttempt as jest.Mock;
const progress = saveProgress as jest.Mock;
const linked = linkedStudent as jest.Mock;
const recordResult = recordStudentResult as jest.Mock;
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
    start.mockResolvedValue('att-1');
    save.mockResolvedValue(undefined);
    progress.mockResolvedValue(undefined);
    linked.mockResolvedValue(null);
    recordResult.mockResolvedValue(undefined);
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
    expect(q[0]).toContain('<b>Savol 1</b>');
    expect(q[0]).toContain('A1 savol');
    expect(q[1].parse_mode).toBe('HTML');
    // Variantlar matnda, tugmalar — bitta qatorda A B C D.
    const rows = q[1].reply_markup.inline_keyboard;
    // 1-qator: harflar; 2-qator: «Natijani bilish».
    expect(rows).toHaveLength(2);
    expect(rows[0].map((b: any) => b.text)).toEqual(['A', 'B', 'C', 'D']);
    expect(rows[0].map((b: any) => b.callback_data)).toEqual([
      'lt:1:0',
      'lt:1:1',
      'lt:1:2',
      'lt:1:3',
    ]);
    expect(session.data.lt.counter).toBe(1);
    expect(session.data.lt.messageId).toBe(55);
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
    expect(save.mock.calls[0][1]).toBe('att-1');
    const saved = save.mock.calls[0][2];
    expect(saved.status).toBe('COMPLETED');
    expect(saved.result).toBe('B2');
    expect(saved.answered).toBe(20);
    expect(saved.questionIds).toHaveLength(20);
    expect(new Set(saved.questionIds).size).toBe(20);
    expect(saved.correctByLevel).toEqual({ A1: 5, A2: 5, B1: 5, B2: 5 });
    expect(session.data.lt.phase).toBe('contact');
  });

  it('test BOSHLANGANDA yoziladi va har javobdan keyin jarayon saqlanadi', async () => {
    await enter();

    expect(start).toHaveBeenCalledWith(expect.anything(), {
      chatId: String(CHAT),
      studentId: null,
      companyId: DEFAULT_COMPANY_ID,
    });
    expect(progress).not.toHaveBeenCalled();

    await answer(true);
    await answer(false);

    expect(progress).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenLastCalledWith(
      expect.anything(),
      'att-1',
      expect.objectContaining({
        answered: 2,
        correctByLevel: { A1: 1 },
      }),
    );
    // Hali yopilmagan: yarim qolsa "tugamagan" bo'lib turadi.
    expect(save).not.toHaveBeenCalled();
  });

  it("urinishni boshlab bo'lmasa — test boshlanmaydi", async () => {
    start.mockRejectedValue(new Error('db'));
    const ctx = await enter();

    expect(ctx.scene.leave).toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(session.data.lt.counter).toBe(0);
  });

  it("jarayonni yozib bo'lmasa ham test davom etadi", async () => {
    await enter();
    progress.mockRejectedValue(new Error('db'));
    await answer(true);

    expect(session.data.lt.counter).toBe(2);
  });

  it("A1 dan o'tilmasa ham hamma daraja so'raladi: 20 savol, keyin natija BEGINNER", async () => {
    await enter();
    // A1: 2 ta to'g'ri, 3 ta xato — daraja o'tilmadi.
    for (let i = 0; i < 5; i++) await answer(i < 2);

    // Test to'xtamaydi: keyingi savol A2 dan.
    expect(save).not.toHaveBeenCalled();
    expect(session.data.lt.current.level).toBe('A2');

    let last: any;
    for (let i = 0; i < 15; i++) last = await answer(true);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][2]).toMatchObject({
      result: 'BEGINNER',
      correctByLevel: { A1: 2, A2: 5, B1: 5, B2: 5 },
    });
    expect(save.mock.calls[0][2].questionIds).toHaveLength(20);
    const texts = last.reply.mock.calls.map((c: any[]) => c[0]);
    expect(texts[0]).toContain('A1 dan past');
    expect(texts[0]).toContain('17 / 20');
    expect(texts[1]).toBe(LEVEL_TEST_PHONE_PROMPT);
  });

  it("A2 dan o'tmasa natija A1, B1 va B2 javoblari hisobga olinmaydi", async () => {
    await enter();
    for (let i = 0; i < 5; i++) await answer(true);
    for (let i = 0; i < 5; i++) await answer(i < 3);
    for (let i = 0; i < 10; i++) await answer(true);

    expect(save.mock.calls[0][2]).toMatchObject({
      result: 'A1',
      correctByLevel: { A1: 5, A2: 3, B1: 5, B2: 5 },
    });
    expect(save.mock.calls[0][2].questionIds).toHaveLength(20);
  });

  it("hamma darajadan 5 tadan so'raladi, tartib A1 → B2", async () => {
    await enter();
    const levels: string[] = [session.data.lt.current.level];
    for (let i = 0; i < 19; i++) {
      await answer(false);
      if (session.data.lt.current) levels.push(session.data.lt.current.level);
    }

    expect(levels).toEqual([
      ...Array(5).fill('A1'),
      ...Array(5).fill('A2'),
      ...Array(5).fill('B1'),
      ...Array(5).fill('B2'),
    ]);
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
    const ctx = await answer(false);

    // Javob va keyingi savol BITTA xabarni tahrirlashda: yangi xabar yo'q.
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    const edited = ctx.editMessageText.mock.calls[0][0] as string;
    expect(edited).toContain('<blockquote expandable>1. A1 savol');
    expect(edited).toContain('→ <b>xato');
    expect(edited).toContain('<b>Savol 2</b>');
    expect(edited).not.toMatch(/✅|❌/);
    expect(ctx.editMessageText.mock.calls[0][1].reply_markup).toBeDefined();
  });

  it("javoblar tarixi bitta xabarda yig'ilib boradi", async () => {
    await enter();
    await answer(true);
    await answer(false);
    const ctx = await answer(true);

    const edited = ctx.editMessageText.mock.calls[0][0] as string;
    expect(edited).toContain('1. A1 savol');
    expect(edited).toContain('2. A1 savol');
    expect(edited).toContain('3. A1 savol');
    expect(edited).toContain('<b>Savol 4</b>');
    expect(edited).toContain('▰▰▰' + '▱'.repeat(17));
    expect(session.data.lt.log).toHaveLength(3);
  });

  it("test oxirida xabar tugmasiz yakuniy ko'rinishga o'tadi, natija alohida xabarda", async () => {
    await enter();
    for (let i = 0; i < 19; i++) await answer(true);
    const last = await answer(true);

    const finalEdit = last.editMessageText.mock.calls[0];
    expect(finalEdit[0]).toContain('tugadi');
    expect(finalEdit[0]).toContain('20. B2 savol');
    expect(finalEdit[1].reply_markup).toBeUndefined();
    expect(last.reply.mock.calls[0][0]).toContain('📊 Natija');
  });

  it("xabar o'chirilgan bo'lsa (tahrir bo'lmasa) savol yangi xabarda yuboriladi", async () => {
    await enter();
    const ctx = callbackCtx(
      `lt:${session.data.lt.counter}:${session.data.lt.current.correctIndex}`,
      session,
    );
    ctx.editMessageText.mockRejectedValue(
      new Error('message to edit not found'),
    );
    ctx.reply.mockResolvedValue({ message_id: 99 });
    await scene().middleware()(ctx, async () => {});

    expect(ctx.reply).toHaveBeenCalledTimes(1);
    expect(ctx.reply.mock.calls[0][0]).toContain('<b>Savol 2</b>');
    expect(session.data.lt.messageId).toBe(99);
  });

  describe('savol vaqti', () => {
    it('savol matnida daraja vaqti turadi va taymer rejalanadi', async () => {
      const ctx = await enter();

      expect(ctx.reply.mock.calls[1][0]).toContain(
        `⏱ ██████████  ${SECONDS_PER_LEVEL.A1} s`,
      );
      const job = { chatId: CHAT, counter: 1, messageId: 55 };
      // 20 s: 5, 10, 15 soniyada vaqt chizig'i yangilanadi, so'ng vaqt tugashi.
      expect(schedule.mock.calls.map((c) => c[0])).toEqual([
        { ...job, delayMs: 5000, action: 'tick' },
        { ...job, delayMs: 10000, action: 'tick' },
        { ...job, delayMs: 15000, action: 'tick' },
        {
          ...job,
          delayMs: (SECONDS_PER_LEVEL.A1 + GRACE_SECONDS) * 1000 + 500,
          action: 'timeout',
        },
      ]);
      expect(session.data.lt.deadlineAt).toBe(
        clock + SECONDS_PER_LEVEL.A1 * 1000,
      );
    });

    it("muddat ichida (kechikish muhlatida ham) berilgan javob o'tadi", async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS);
      const ctx = await answer(true);

      expect(session.data.lt.correct.A1).toBe(1);
      expect(ctx.editMessageText.mock.calls[0][0]).toContain('→ <b>');
    });

    it('muddatdan keyingi bosish — vaqt tugadi: javob hisobga olinmay, keyingi savol', async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
      const ctx = await answer(true);

      expect(session.data.lt.correct.A1).toBe(0);
      expect(ctx.answerCbQuery).toHaveBeenCalledWith(LEVEL_TEST_TIMEOUT_NOTE);
      const edited = ctx.editMessageText.mock.calls[0][0] as string;
      expect(edited).toContain('→ <i>⏱ javobsiz</i>');
      expect(edited).toContain('<b>Savol 2</b>');
      expect(session.data.lt.counter).toBe(2);
      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it("taymer yangilanishi muddat o'tgach savolni yopadi va keyingisini beradi", async () => {
      await enter();
      wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
      const ctx = await timeoutTick(1);

      expect(session.data.lt.correct.A1).toBe(0);
      expect(session.data.lt.timeoutsInRow).toBe(1);
      expect(ctx.answerCbQuery).not.toHaveBeenCalled();
      const edited = ctx.editMessageText.mock.calls[0][0] as string;
      expect(edited).toContain('→ <i>⏱ javobsiz</i>');
      expect(edited).toContain('<b>Savol 2</b>');
      expect(session.data.lt.counter).toBe(2);
      // 1-savol: 3 tick + timeout; 2-savol: yana 3 tick + timeout.
      expect(schedule).toHaveBeenCalledTimes(8);
    });

    describe("qolgan vaqt chizig'i", () => {
      const tick = async (counter: number) => {
        const ctx = withCtx(
          levelTestTimeoutUpdate(CHAT, counter, 55, clock, 'tick') as any,
          session,
        );
        await scene().middleware()(ctx, async () => {});
        return ctx;
      };

      it('tick xabarni qolgan vaqt va tugmalar bilan qayta chizadi', async () => {
        await enter();
        wait(5);
        const ctx = await tick(1);

        expect(ctx.answerCbQuery).not.toHaveBeenCalled();
        const [html, extra] = ctx.editMessageText.mock.calls[0];
        expect(html).toContain('⏱ ████████░░  15 s');
        expect(extra.parse_mode).toBe('HTML');
        expect(
          extra.reply_markup.inline_keyboard[0].map((b: any) => b.text),
        ).toEqual(['A', 'B', 'C', 'D']);
        // Tick hech narsani hisoblamaydi.
        expect(session.data.lt.counter).toBe(1);
        expect(session.data.lt.log).toHaveLength(0);
      });

      it('vaqt kamayib boradi: 15 s, 10 s, 5 s', async () => {
        await enter();
        const seen: string[] = [];
        for (const sec of [5, 5, 5]) {
          wait(sec);
          const ctx = await tick(1);
          seen.push(
            ctx.editMessageText.mock.calls[0][0].match(/⏱ \S+ +(\d+) s/)[1],
          );
        }
        expect(seen).toEqual(['15', '10', '5']);
      });

      it("tahrir xato bersa (masalan, 'not modified') jim o'tadi", async () => {
        await enter();
        wait(5);
        const ctx = withCtx(
          levelTestTimeoutUpdate(CHAT, 1, 55, clock, 'tick') as any,
          session,
        );
        ctx.editMessageText.mockRejectedValue(new Error('flood'));
        await scene().middleware()(ctx, async () => {});

        expect(ctx.reply).not.toHaveBeenCalled();
        expect(session.data.lt.current).not.toBeNull();
      });

      it("javob berilgan, eski yoki band savolga tick e'tiborsiz", async () => {
        await enter();
        await answer(true);
        wait(5);
        const old = await tick(1);
        expect(old.editMessageText).not.toHaveBeenCalled();

        session.processing = true;
        const busy = await tick(2);
        expect(busy.editMessageText).not.toHaveBeenCalled();
      });

      it("muddat o'tgach tick e'tiborsiz (vaqt tugashini taymer hal qiladi)", async () => {
        await enter();
        wait(SECONDS_PER_LEVEL.A1);
        const ctx = await tick(1);
        expect(ctx.editMessageText).not.toHaveBeenCalled();
      });
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

    it("ketma-ket 3 ta javobsiz savoldan keyin test to'xtatiladi: TIMED_OUT, natijasiz", async () => {
      await enter();
      let last: any;
      for (let i = 0; i < MAX_TIMEOUTS_IN_ROW; i++) {
        wait(SECONDS_PER_LEVEL.A1 + GRACE_SECONDS + 1);
        last = await timeoutTick(session.data.lt.counter);
      }

      expect(last.scene.leave).toHaveBeenCalled();
      expect(last.reply.mock.calls[0][0]).toBe(LEVEL_TEST_ABANDONED);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][2]).toMatchObject({
        status: 'TIMED_OUT',
        result: null,
        answered: MAX_TIMEOUTS_IN_ROW,
      });
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
      for (let i = 0; i < 20; i++) await answer(false);
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

    it("urinishni yopib bo'lmasa ham natija va telefon so'rovi chiqadi", async () => {
      save.mockRejectedValue(new Error('db'));
      await enter();
      let last: any;
      for (let i = 0; i < 20; i++) last = await answer(false);

      const texts = last.reply.mock.calls.map((c: any[]) => c[0]);
      expect(texts[0]).toContain('📊 Natija');
      expect(texts).toContain(LEVEL_TEST_PHONE_PROMPT);
    });
  });

  it("/cancel testni to'xtatadi: urinish CANCELLED, natijasiz", async () => {
    await enter();
    await answer(true);
    const ctx = textCtx('/cancel', session);
    await scene().middleware()(ctx, async () => {});

    expect(ctx.scene.leave).toHaveBeenCalled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][2]).toMatchObject({
      status: 'CANCELLED',
      result: null,
      answered: 1,
    });
  });

  describe('«🏁 Natijani bilish» — testni o‘zi to‘xtatish', () => {
    const tap = async (data: string) => {
      const ctx = callbackCtx(data, session);
      await scene().middleware()(ctx, async () => {});
      return ctx;
    };
    const n = () => session.data.lt.counter;

    it('har savolda tugma bor; bosilsa avval Ha/Yo‘q so‘raladi', async () => {
      const q = await enter();
      const rows = q.reply.mock.calls[1][1].reply_markup.inline_keyboard;
      expect(rows[1][0]).toMatchObject({
        text: '🏁 Natijani bilish',
        callback_data: 'ltx:1',
      });

      const ctx = await tap('ltx:1');
      expect(ctx.answerCbQuery).toHaveBeenCalledWith(LEVEL_TEST_STOP_CONFIRM);
      const kb = ctx.editMessageText.mock.calls[0][1].reply_markup;
      expect(kb.inline_keyboard).toHaveLength(1);
      expect(kb.inline_keyboard[0].map((b: any) => b.callback_data)).toEqual([
        'lty:1',
        'ltn:1',
      ]);
      // Hali hech narsa to'xtamagan.
      expect(save).not.toHaveBeenCalled();
      expect(session.data.lt.current).not.toBeNull();
    });

    it('«Yo‘q, davom etaman» javob tugmalarini qaytaradi', async () => {
      await enter();
      await tap('ltx:1');
      const ctx = await tap('ltn:1');

      const rows =
        ctx.editMessageText.mock.calls[0][1].reply_markup.inline_keyboard;
      expect(rows[0].map((b: any) => b.text)).toEqual(['A', 'B', 'C', 'D']);
      expect(session.data.lt.confirmStop).toBe(false);
    });

    it('javob berilsa tasdiq holati tozalanadi', async () => {
      await enter();
      await tap('ltx:1');
      await answer(true);
      expect(session.data.lt.confirmStop).toBe(false);
    });

    it('A2 ning o‘rtasida to‘xtatilsa: STOPPED, natija “kamida A1”, shu yerda to‘xtaydi', async () => {
      await enter();
      for (let i = 0; i < 5; i++) await answer(true); // A1: 5/5
      await answer(true);
      await answer(false); // A2: 1/2
      await tap(`ltx:${n()}`);
      const ctx = await tap(`lty:${n()}`);

      expect(save).toHaveBeenCalledTimes(1);
      expect(save.mock.calls[0][2]).toMatchObject({
        status: 'STOPPED',
        result: 'A1',
        answered: 7,
        correctByLevel: { A1: 5, A2: 1 },
      });
      const texts = ctx.reply.mock.calls.map((c: any[]) => c[0]);
      expect(texts[0]).toContain('taxminan A1');
      expect(texts[0]).toContain('6 / 7');
      expect(texts[0]).toContain('oxiriga yetkazmadingiz (7 / 20)');
      expect(texts[1]).toBe(LEVEL_TEST_PHONE_PROMPT);
      // Yakuniy xabar tugmasiz, jami tarix bilan.
      const finalEdit = ctx.editMessageText.mock.calls[0];
      expect(finalEdit[0]).toContain('tugadi');
      expect(finalEdit[1].reply_markup).toBeUndefined();
    });

    it('A1 tugamasdan to‘xtatilsa natija aniqlanmaydi (UNKNOWN)', async () => {
      await enter();
      await answer(true);
      await answer(true);
      await tap(`ltx:${n()}`);
      const ctx = await tap(`lty:${n()}`);

      expect(save.mock.calls[0][2]).toMatchObject({
        status: 'STOPPED',
        result: 'UNKNOWN',
        answered: 2,
      });
      expect(ctx.reply.mock.calls[0][0]).toContain('hali aniqlanmadi');
      expect(ctx.reply.mock.calls[0][0]).not.toContain(
        'oxiriga yetkazmadingiz',
      );
    });

    it('to‘xtatilgach telefon va filialdan so‘ng lid shu natija bilan ochiladi', async () => {
      await enter();
      for (let i = 0; i < 5; i++) await answer(true);
      await tap(`ltx:${n()}`);
      await tap(`lty:${n()}`);
      await scene().middleware()(contactCtx(OWN, session), async () => {});
      await scene().middleware()(callbackCtx('ltb:2', session), async () => {});

      expect(makeLead).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ result: 'A1', attemptId: 'att-1' }),
      );
    });

    it('eski yoki band savolga to‘xtatish e‘tiborsiz', async () => {
      await enter();
      await answer(true);
      const old = await tap('ltx:1');
      expect(old.answerCbQuery).toHaveBeenCalledWith(LEVEL_TEST_STALE);
      expect(old.editMessageText).not.toHaveBeenCalled();

      session.processing = true;
      const busy = await tap(`lty:${n()}`);
      expect(busy.answerCbQuery).toHaveBeenCalledWith(LEVEL_TEST_STALE);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('bot chati o‘quvchi kartasiga bog‘langan', () => {
    const STUDENT = {
      id: 12345,
      firstName: 'Ali',
      lastName: 'Valiyev',
      companyId: 1001,
    };
    beforeEach(() => linked.mockResolvedValue(STUDENT));

    it('urinish o‘quvchiga bog‘lanadi', async () => {
      await enter();
      expect(start).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ studentId: 12345 }),
      );
    });

    it('tugagach telefon/filial so‘ralmaydi, lid ochilmaydi, tarixga yoziladi', async () => {
      await enter();
      let last: any;
      for (let i = 0; i < 20; i++) last = await answer(true);

      expect(recordResult).toHaveBeenCalledWith(expect.anything(), STUDENT, {
        status: 'COMPLETED',
        result: 'B2',
        answered: 20,
        correct: 20,
      });
      const texts = last.reply.mock.calls.map((c: any[]) => c[0]);
      expect(texts).not.toContain(LEVEL_TEST_PHONE_PROMPT);
      expect(texts.join('\n')).not.toContain('Natijangiz saqlandi');
      expect(last.scene.leave).toHaveBeenCalled();
      expect(makeLead).not.toHaveBeenCalled();
    });

    it('o‘zi to‘xtatsa ham profilga yoziladi; natijasi aniqlanmasa yozilmaydi', async () => {
      await enter();
      for (let i = 0; i < 5; i++) await answer(true);
      let ctx = callbackCtx(`ltx:${session.data.lt.counter}`, session);
      await scene().middleware()(ctx, async () => {});
      ctx = callbackCtx(`lty:${session.data.lt.counter}`, session);
      await scene().middleware()(ctx, async () => {});

      expect(recordResult).toHaveBeenCalledWith(
        expect.anything(),
        STUDENT,
        expect.objectContaining({ status: 'STOPPED', result: 'A1' }),
      );

      // Alohida urinish: 1 ta savol — UNKNOWN, tarixga yozilmaydi.
      recordResult.mockClear();
      session = { step: 0, data: {}, processing: false };
      await enter();
      await answer(true);
      ctx = callbackCtx(`ltx:${session.data.lt.counter}`, session);
      await scene().middleware()(ctx, async () => {});
      ctx = callbackCtx(`lty:${session.data.lt.counter}`, session);
      await scene().middleware()(ctx, async () => {});
      expect(recordResult).not.toHaveBeenCalled();
    });
  });
});
