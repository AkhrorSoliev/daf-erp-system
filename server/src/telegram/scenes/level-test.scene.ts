import { Logger } from '@nestjs/common';
import { Markup, Scenes } from 'telegraf';
import { message } from 'telegraf/filters';
import type { EntityHistoryService } from '../../common/entity-history';
import {
  normalizeSharedPhone,
  SHARED_PHONE_INVALID,
} from '../../common/utils/phone.util';
import type { Update } from 'telegraf/types';
import {
  askQuestion,
  GRACE_SECONDS,
  isPastDeadline,
  judge,
  levelPassed,
  MAX_TIMEOUTS_IN_ROW,
  nextLevel,
  pickQuestions,
  secondsFor,
} from '../../level-test/level-test.logic';
import { LEVEL_TEST_QUESTIONS } from '../../level-test/level-test-questions';
import {
  branchChoices,
  createLeadFromTest,
  saveAttempt,
  seenQuestionIds,
  type BranchChoice,
} from '../../level-test/level-test.store';
import {
  LEVEL_TEST_ABANDONED,
  LEVEL_TEST_BRANCH_PROMPT,
  LEVEL_TEST_FAILED,
  LEVEL_TEST_INTRO,
  LEVEL_TEST_LATER_BUTTON,
  LEVEL_TEST_LATER_REPLY,
  LEVEL_TEST_LEAD_DONE,
  LEVEL_TEST_NO_BRANCH,
  LEVEL_TEST_PHONE_PROMPT,
  LEVEL_TEST_STALE,
  LEVEL_TEST_TIMEOUT_NOTE,
  levelTestOptionLabel,
  levelTestQuestionText,
  levelTestResultText,
} from '../../level-test/level-test.texts';
import {
  LEVEL_TEST_LEVELS,
  type AskedQuestion,
  type CorrectByLevel,
  type LevelTestQuestion,
  type LevelTestResult,
} from '../../level-test/level-test.types';
import type { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_COMPANY_ID, SCENES } from '../constants';
import type { BotContext } from '../types/context';
import {
  CONTACT_NOT_OWN,
  contactBelongsToSender,
} from '../utils/contact-ownership';
import { withProcessingLock } from '../utils/processing-lock';

/** The /start menu button «📊 Darajani aniqlash». */
export const LEVEL_TEST_ACTION = 'menu_level';

const ANSWER_RE = /^lt:(\d+):(\d)$/;
const TIMEOUT_RE = /^ltt:(\d+)$/;
const BRANCH_RE = /^ltb:(\d+)$/;

/** Taymerni sahnaga yetkazish: `delayMs` dan keyin `ltt:<counter>` yuboriladi. */
export interface LevelTestTimeoutJob {
  chatId: number;
  counter: number;
  messageId: number;
  delayMs: number;
}

export interface LevelTestTiming {
  now?: () => number;
  schedule?: (job: LevelTestTimeoutJob) => void;
}

/**
 * Savol vaqti tugaganda botning O'ZI yuboradigan yangilanish. Telegram taymer
 * bermaydi, shuning uchun bu — `ltt:<counter>` tugmasi bosilgandek ko'rinadigan
 * ichki yangilanish: u sessiya va sahna middleware'laridan odatdagi yo'l bilan
 * o'tadi (sessiya jonli obyekt sifatida bo'lishilgani uchun poyga yo'q).
 * Foydalanuvchi bunday tugmani ko'rmaydi; sahna baribir muddat o'tganini
 * o'zi tekshiradi.
 */
export function levelTestTimeoutUpdate(
  chatId: number,
  counter: number,
  messageId: number,
  nowMs: number = Date.now(),
): Update {
  return {
    update_id: nowMs,
    callback_query: {
      id: `lt-timeout-${chatId}-${counter}`,
      chat_instance: 'level-test',
      from: { id: chatId, is_bot: false, first_name: 'Test' },
      message: {
        message_id: messageId,
        date: Math.floor(nowMs / 1000),
        chat: { id: chatId, type: 'private', first_name: 'Test' },
      },
      data: `ltt:${counter}`,
    },
  } as Update;
}

const CONTACT_KEYBOARD = Markup.keyboard([
  [Markup.button.contactRequest('📱 Telefon raqamni yuborish')],
  [LEVEL_TEST_LATER_BUTTON],
])
  .resize()
  .oneTime();

/** Scene state, kept in `ctx.session.data.lt` (Redis session). */
interface LtState {
  phase: 'quiz' | 'contact' | 'branch';
  levelIdx: number;
  /** Ids still to ask in the current level. */
  queue: string[];
  answeredInLevel: number;
  /** How many questions were shown: guards a stale tap on an old question. */
  counter: number;
  current: AskedQuestion | null;
  /** Savol ko'rsatilgan paytdan + daraja vaqti (ms). */
  deadlineAt: number;
  /** Savol xabari: vaqt tugaganda shu xabar tahrirlanadi. */
  messageId: number;
  /** Ketma-ket nechta savol javobsiz qoldi. */
  timeoutsInRow: number;
  correct: CorrectByLevel;
  askedIds: string[];
  /** Questions this chat saw in earlier attempts. */
  seen: string[];
  attemptId?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  branches?: BranchChoice[];
}

const stateOf = (ctx: BotContext): LtState | undefined =>
  ctx.session.data.lt as LtState | undefined;

/**
 * «📊 Darajani aniqlash»: up to 20 multiple-choice questions, A1 → B2, five a
 * level; a level below 4 right ends the test (`judge`). The result is saved as
 * a `LevelTestAttempt`; the person may then send their own phone and pick a
 * branch, which opens a lead on that branch's board (ADR-0121).
 *
 * Questions are drawn at random from the pool, preferring ones this chat has
 * not seen, with the options shuffled — a retake or a shared answer key does
 * not help.
 */
export function createLevelTestScene(
  prisma: PrismaService,
  history: Pick<EntityHistoryService, 'recordCreate'>,
  pool: readonly LevelTestQuestion[] = LEVEL_TEST_QUESTIONS,
  rng: () => number = Math.random,
  timing: LevelTestTiming = {},
): Scenes.BaseScene<BotContext> {
  const now = timing.now ?? Date.now;
  const logger = new Logger('LevelTestScene');
  const scene = new Scenes.BaseScene<BotContext>(SCENES.LEVEL_TEST);
  const byId = new Map(pool.map((q) => [q.id, q]));

  function startLevel(state: LtState, levelIdx: number): void {
    state.levelIdx = levelIdx;
    state.answeredInLevel = 0;
    state.queue = pickQuestions(
      pool,
      LEVEL_TEST_LEVELS[levelIdx],
      new Set(state.seen),
      undefined,
      rng,
    ).map((q) => q.id);
  }

  async function askNext(ctx: BotContext, state: LtState): Promise<void> {
    const id = state.queue.shift();
    const q = id ? byId.get(id) : undefined;
    if (!q) {
      await finish(ctx, state);
      return;
    }
    const asked = askQuestion(q, rng);
    state.current = asked;
    state.counter += 1;
    state.askedIds.push(asked.id);
    const seconds = secondsFor(asked.level);
    const sent = await ctx.reply(
      levelTestQuestionText(state.counter, asked.text, seconds),
      Markup.inlineKeyboard(
        asked.options.map((option, i) => [
          Markup.button.callback(
            levelTestOptionLabel(i, option),
            `lt:${state.counter}:${i}`,
          ),
        ]),
      ),
    );
    state.messageId = sent?.message_id ?? 0;
    state.deadlineAt = now() + seconds * 1000;
    timing.schedule?.({
      chatId: ctx.chat!.id,
      counter: state.counter,
      messageId: state.messageId,
      // Kechikish muhlatidan keyin yarim soniya: odam oxirgi soniyada bossa,
      // avval uning javobi o'tadi.
      delayMs: (seconds + GRACE_SECONDS) * 1000 + 500,
    });
  }

  /**
   * Savolni yopadi: `chosen` — tanlangan variant, `null` — vaqt tugadi (xato
   * hisoblanadi). Keyin yo keyingi savolga o'tadi, yo testni tugatadi, yo
   * (ketma-ket javobsizlikda) odam ketgan deb to'xtatadi.
   */
  async function settle(
    ctx: BotContext,
    state: LtState,
    chosen: number | null,
  ): Promise<void> {
    const asked = state.current!;
    const level = asked.level;
    state.correct[level] =
      (state.correct[level] ?? 0) + (chosen === asked.correctIndex ? 1 : 0);
    state.answeredInLevel += 1;
    state.current = null;
    state.timeoutsInRow = chosen === null ? state.timeoutsInRow + 1 : 0;
    const shown = levelTestQuestionText(
      state.counter,
      asked.text,
      secondsFor(level),
    );
    try {
      await ctx.editMessageText(
        `${shown}\n\n${
          chosen === null
            ? LEVEL_TEST_TIMEOUT_NOTE
            : `✅ Javobingiz: ${asked.options[chosen] ?? ''}`
        }`,
      );
    } catch {
      // Old or already edited message: the answer still counts.
    }

    if (state.timeoutsInRow >= MAX_TIMEOUTS_IN_ROW) {
      await ctx.scene.leave();
      await ctx.reply(LEVEL_TEST_ABANDONED, Markup.removeKeyboard());
      return;
    }
    if (state.queue.length === 0) {
      if (nextLevel(level) && levelPassed(state.correct[level] ?? 0)) {
        startLevel(state, state.levelIdx + 1);
      } else {
        await finish(ctx, state);
        return;
      }
    }
    await askNext(ctx, state);
  }

  async function finish(ctx: BotContext, state: LtState): Promise<void> {
    const result: LevelTestResult = judge(state.correct);
    const correctTotal = Object.values(state.correct).reduce(
      (sum, n) => sum + (n ?? 0),
      0,
    );
    state.current = null;
    try {
      state.attemptId = await saveAttempt(prisma, {
        chatId: String(ctx.chat!.id),
        questionIds: state.askedIds,
        correctByLevel: state.correct,
        result,
        companyId: DEFAULT_COMPANY_ID,
      });
    } catch (error) {
      logger.error("Daraja testi urinishini saqlab bo'lmadi", error as Error);
    }
    await ctx.reply(
      levelTestResultText(result, correctTotal, state.askedIds.length),
    );
    if (!state.attemptId) {
      await ctx.scene.leave();
      return;
    }
    state.phase = 'contact';
    await ctx.reply(LEVEL_TEST_PHONE_PROMPT, CONTACT_KEYBOARD);
  }

  async function openLead(
    ctx: BotContext,
    state: LtState,
    branchId: number,
  ): Promise<void> {
    try {
      const outcome = await createLeadFromTest(prisma, history, {
        attemptId: state.attemptId!,
        firstName: state.firstName!,
        lastName: state.lastName!,
        phone: state.phone!,
        branchId,
        companyId: DEFAULT_COMPANY_ID,
        result: judge(state.correct),
      });
      if (outcome.kind === 'no-section') {
        logger.warn(
          `Filial ${branchId} da "Yangi" ustuni/bo'limi yo'q — daraja testi lidi yaratilmadi`,
        );
      }
      await ctx.reply(
        outcome.kind === 'no-section'
          ? LEVEL_TEST_NO_BRANCH
          : LEVEL_TEST_LEAD_DONE,
        Markup.removeKeyboard(),
      );
    } catch (error) {
      logger.error("Daraja testi lidini yaratib bo'lmadi", error as Error);
      await ctx.reply(LEVEL_TEST_FAILED, Markup.removeKeyboard());
    }
    await ctx.scene.leave();
  }

  scene.enter(async (ctx) => {
    if (ctx.chat?.type !== 'private') {
      await ctx.scene.leave();
      return;
    }
    await withProcessingLock(ctx, async () => {
      const chatId = String(ctx.chat!.id);
      const seen = [...(await seenQuestionIds(prisma, chatId))];
      const state: LtState = {
        phase: 'quiz',
        levelIdx: 0,
        queue: [],
        answeredInLevel: 0,
        counter: 0,
        current: null,
        deadlineAt: 0,
        messageId: 0,
        timeoutsInRow: 0,
        correct: {},
        askedIds: [],
        seen,
      };
      ctx.session.data = { lt: state };
      startLevel(state, 0);
      await ctx.reply(LEVEL_TEST_INTRO, Markup.removeKeyboard());
      await askNext(ctx, state);
    });
  });

  scene.action(ANSWER_RE, async (ctx) => {
    const state = stateOf(ctx);
    const [, counter, optionIdx] = ctx.match;
    if (
      !state ||
      state.phase !== 'quiz' ||
      !state.current ||
      Number(counter) !== state.counter
    ) {
      await ctx.answerCbQuery(LEVEL_TEST_STALE);
      return;
    }
    if (ctx.session.processing) {
      await ctx.answerCbQuery();
      return;
    }
    // Muddatdan keyin kelgan javob hisobga olinmaydi: vaqt tugagan.
    const late = isPastDeadline(state.deadlineAt, now());
    await ctx.answerCbQuery(late ? LEVEL_TEST_TIMEOUT_NOTE : undefined);
    await withProcessingLock(ctx, () =>
      settle(ctx, state, late ? null : Number(optionIdx)),
    );
  });

  // Taymer yuborgan ichki yangilanish (`levelTestTimeoutUpdate`): tugma emas,
  // shuning uchun `answerCbQuery` chaqirilmaydi.
  scene.action(TIMEOUT_RE, async (ctx) => {
    const state = stateOf(ctx);
    if (
      !state ||
      state.phase !== 'quiz' ||
      !state.current ||
      Number(ctx.match[1]) !== state.counter ||
      ctx.session.processing ||
      !isPastDeadline(state.deadlineAt, now())
    ) {
      return;
    }
    await withProcessingLock(ctx, () => settle(ctx, state, null));
  });

  scene.on(message('contact'), async (ctx) => {
    const state = stateOf(ctx);
    if (!state || state.phase !== 'contact' || ctx.session.processing) return;
    const contact = ctx.message.contact;
    if (!contactBelongsToSender(contact, ctx.from)) {
      await ctx.reply(CONTACT_NOT_OWN, CONTACT_KEYBOARD);
      return;
    }
    const phone = normalizeSharedPhone(contact.phone_number);
    if (!phone) {
      await ctx.reply(SHARED_PHONE_INVALID, CONTACT_KEYBOARD);
      return;
    }
    await withProcessingLock(ctx, async () => {
      state.phone = phone;
      state.firstName =
        (contact.first_name || ctx.from?.first_name || '').trim() || 'Telegram';
      state.lastName =
        (contact.last_name || ctx.from?.last_name || '').trim() || '-';

      let branches: BranchChoice[];
      try {
        branches = await branchChoices(prisma, DEFAULT_COMPANY_ID);
      } catch (error) {
        logger.error("Filiallarni o'qib bo'lmadi", error as Error);
        await ctx.reply(LEVEL_TEST_FAILED, Markup.removeKeyboard());
        await ctx.scene.leave();
        return;
      }
      if (branches.length === 0) {
        await ctx.reply(LEVEL_TEST_NO_BRANCH, Markup.removeKeyboard());
        await ctx.scene.leave();
        return;
      }
      if (branches.length === 1) {
        await openLead(ctx, state, branches[0].id);
        return;
      }
      state.branches = branches;
      state.phase = 'branch';
      await ctx.reply(
        LEVEL_TEST_BRANCH_PROMPT,
        Markup.inlineKeyboard(
          branches.map((b) => [Markup.button.callback(b.name, `ltb:${b.id}`)]),
        ),
      );
    });
  });

  scene.action(BRANCH_RE, async (ctx) => {
    const state = stateOf(ctx);
    const branchId = Number(ctx.match[1]);
    if (
      !state ||
      state.phase !== 'branch' ||
      !state.branches?.some((b) => b.id === branchId)
    ) {
      await ctx.answerCbQuery(LEVEL_TEST_STALE);
      return;
    }
    if (ctx.session.processing) {
      await ctx.answerCbQuery();
      return;
    }
    await ctx.answerCbQuery();
    await withProcessingLock(ctx, async () => {
      try {
        await ctx.editMessageReplyMarkup(undefined);
      } catch {
        // Message too old to edit.
      }
      await openLead(ctx, state, branchId);
    });
  });

  scene.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    const state = stateOf(ctx);
    if (text === '/cancel') {
      await ctx.scene.leave();
      await ctx.reply(
        'Bekor qilindi. Qayta boshlash uchun /start bosing.',
        Markup.removeKeyboard(),
      );
      return;
    }
    if (state?.phase === 'contact') {
      if (text === LEVEL_TEST_LATER_BUTTON) {
        await ctx.scene.leave();
        await ctx.reply(LEVEL_TEST_LATER_REPLY, Markup.removeKeyboard());
        return;
      }
      await ctx.reply(LEVEL_TEST_PHONE_PROMPT, CONTACT_KEYBOARD);
      return;
    }
    if (state?.phase === 'quiz') {
      await ctx.reply('Iltimos, javobni savol ostidagi tugmalardan tanlang.');
    }
  });

  return scene;
}
