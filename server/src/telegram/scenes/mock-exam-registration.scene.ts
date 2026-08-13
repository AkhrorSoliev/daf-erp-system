import { Logger } from '@nestjs/common';
import { Scenes, Markup, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { MockExamStatus, Prisma } from '@prisma/client';
import { BotContext } from '../types/context';
import { SCENES } from '../constants';
import {
  FIRST_NAME_HINT,
  MULTI_WORD_NAME_HINT,
  looksLikeFullName,
} from '../name-prompts';
import {
  normalizeSharedPhone,
  SHARED_PHONE_INVALID,
} from '../../common/utils/phone.util';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentLinkService } from '../../payment-gateways/payment-link.service';
import { resolveParticipantFee } from '../../mock-exams/mock-exam-pricing.util';

/**
 * Mock exam registration scene.
 *
 * Entry: user clicks t.me/<BOT>?start=mock_<botStartPayload> → telegram.service
 * routes here with `ctx.session.data.examId` set.
 *
 * Flow: walk the exam's `formFields` array one question at a time. Each
 * question is rendered based on the field's `type` (text → free text input,
 * phone → contact-share button, select/radio → inline keyboard with options,
 * checkbox → Ha/Yo'q, date → DD.MM.YYYY text).
 *
 * State carried in `ctx.session.data`:
 *   - examId: string (which exam they're registering for)
 *   - examTitle: string
 *   - fields: FormField[] (snapshotted on enter — so live form edits don't
 *     break in-flight registrations)
 *   - currentFieldIndex: number (which question is being asked now)
 *   - answers: { [fieldId]: any } (filled progressively)
 */

type FormFieldOption = { value: string; label: string };
type MapsToValue = 'firstName' | 'lastName' | 'phone';
type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'phone'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'date';

interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: FormFieldOption[];
  mapsTo?: MapsToValue;
}

const UZ_PHONE_RE = /^\d{9}$/;
const UZ_PHONE_FULL_RE = /^(\+?998)?\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// DD.MM.YYYY or YYYY-MM-DD
const DATE_RE = /^(\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2})$/;

/** The bot is single-tenant for now; see the fee-settlement call below. */
const DEFAULT_COMPANY_ID = 1001;

export function createMockExamRegistrationScene(
  prisma: PrismaService,
  paymentLinkService: PaymentLinkService,
  _bot: Telegraf<BotContext>,
): Scenes.BaseScene<BotContext> {
  const logger = new Logger('MockExamRegistrationScene');
  const scene = new Scenes.BaseScene<BotContext>(
    SCENES.MOCK_EXAM_REGISTRATION,
  );

  scene.enter(async (ctx) => {
    const examId = ctx.session.data?.examId;
    if (!examId) {
      await ctx.reply('Xatolik: imtihon aniqlanmadi.');
      await ctx.scene.leave();
      return;
    }

    const exam = await prisma.mockExam.findFirst({
      where: { id: examId, deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        examDate: true,
        registrationDeadline: true,
        formFields: true,
        offeredLevels: true,
        examTimes: true,
      },
    });

    if (!exam) {
      await ctx.reply('Imtihon topilmadi yoki o\'chirilgan.');
      await ctx.scene.leave();
      return;
    }

    if (exam.status !== MockExamStatus.REGISTRATION_OPEN) {
      await ctx.reply(
        `Hozir "${exam.title}" imtihoniga ro'yxatga olish yopiq.\n\nKeyinroq qayta urinib ko'ring.`,
      );
      await ctx.scene.leave();
      return;
    }

    if (
      exam.registrationDeadline &&
      exam.registrationDeadline.getTime() < Date.now()
    ) {
      await ctx.reply(
        `"${exam.title}" imtihoniga ro'yxatga olish muddati o'tib ketgan.`,
      );
      await ctx.scene.leave();
      return;
    }

    const chatId = String(ctx.chat!.id);

    // Already registered?
    const existing = await prisma.mockExamParticipant.findFirst({
      where: {
        examId,
        telegramChatId: chatId,
        deletedAt: null,
      },
    });
    if (existing) {
      const when = existing.registeredAt.toLocaleDateString('uz-UZ');
      await ctx.reply(
        `Siz allaqachon ushbu imtihonga ro'yxatga olingansiz (${when}).\n\nNatijalar e'lon qilingach, sizga shu yerda xabar yuboriladi.`,
      );
      await ctx.scene.leave();
      return;
    }

    const fields = Array.isArray(exam.formFields)
      ? (exam.formFields as unknown as FormField[])
      : [];
    if (fields.length === 0) {
      logger.warn(`Mock exam ${examId} has no form fields configured`);
      await ctx.reply(
        'Imtihon formasi sozlanmagan. Administrator bilan bog\'laning.',
      );
      await ctx.scene.leave();
      return;
    }

    const offeredLevels = Array.isArray(exam.offeredLevels)
      ? (exam.offeredLevels as string[])
      : [];
    const examTimes = Array.isArray(exam.examTimes)
      ? (exam.examTimes as string[])
      : [];

    ctx.session.data = {
      examId: exam.id,
      examTitle: exam.title,
      fields,
      currentFieldIndex: 0,
      answers: {},
      offeredLevels,
      level: null,
      examTimes,
      // A single offered time is auto-assigned; only 2+ trigger a choice.
      examTime: examTimes.length === 1 ? examTimes[0] : null,
      // Choice steps that run before the form questions start.
      awaitingLevel: offeredLevels.length > 0,
      awaitingTime: false,
    };

    const intro = buildIntroMessage(exam);
    await ctx.reply(intro, Markup.removeKeyboard());
    if (offeredLevels.length > 0) {
      await askLevel(ctx, offeredLevels);
    } else {
      await startTimeOrFields(ctx);
    }
  });

  // /cancel — leave the scene gracefully
  const cancelHandler = async (ctx: BotContext) => {
    await ctx.scene.leave();
    await ctx.reply(
      "Ro'yxatga olish bekor qilindi. Qayta boshlash uchun /start bosing.",
      Markup.removeKeyboard(),
    );
  };
  scene.command('cancel', cancelHandler);

  // Level selection (inline buttons shown before the form questions)
  scene.action(/^me_lvl:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session.data?.awaitingLevel) return;
    const value = ctx.match[1];
    const offered = (ctx.session.data.offeredLevels as string[]) ?? [];
    if (!offered.includes(value)) {
      await ctx.reply(
        "Iltimos, ko'rsatilgan darajalardan birini tanlang.",
      );
      return;
    }
    ctx.session.data.level = value;
    ctx.session.data.awaitingLevel = false;
    await startTimeOrFields(ctx);
  });

  // Time-slot selection (inline buttons shown after level, before the form)
  scene.action(/^me_time:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    if (!ctx.session.data?.awaitingTime) return;
    const value = ctx.match[1];
    const times = (ctx.session.data.examTimes as string[]) ?? [];
    if (!times.includes(value)) {
      await ctx.reply("Iltimos, ko'rsatilgan vaqtlardan birini tanlang.");
      return;
    }
    ctx.session.data.examTime = value;
    ctx.session.data.awaitingTime = false;
    const fields = ctx.session.data.fields as FormField[];
    await askField(ctx, fields[0]);
  });

  // Inline button selection (select / radio / checkbox)
  scene.action(/^me_opt:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const value = ctx.match[1];
    await handleAnswer(ctx, prisma, paymentLinkService, value);
  });

  // Phone share via Telegram Contact
  scene.on(message('contact'), async (ctx) => {
    const field = currentField(ctx);
    if (!field || field.type !== 'phone') return;

    // Kontakt tugmasidan kelgan raqamni Telegram o'zi beradi — chet el
    // raqami ham qabul qilinadi (o'zbek raqami 9 xonaga keltiriladi).
    const phone = normalizeSharedPhone(ctx.message.contact.phone_number);
    if (!phone) {
      await ctx.reply(SHARED_PHONE_INVALID);
      return;
    }
    await handleAnswer(ctx, prisma, paymentLinkService, phone);
  });

  // Free-text input
  scene.on(message('text'), async (ctx) => {
    const text = ctx.message.text.trim();
    if (text === '/cancel') {
      await cancelHandler(ctx);
      return;
    }
    if (text.startsWith('/start')) {
      await ctx.scene.reenter();
      return;
    }

    // Still waiting for the level pick — force the inline button.
    if (ctx.session.data?.awaitingLevel) {
      await ctx.reply('Iltimos, yuqoridagi darajalardan birini tanlang.');
      return;
    }
    // Still waiting for the time pick — force the inline button.
    if (ctx.session.data?.awaitingTime) {
      await ctx.reply('Iltimos, yuqoridagi vaqtlardan birini tanlang.');
      return;
    }

    const field = currentField(ctx);
    if (!field) return;

    // Inline options must be picked via button — ignore raw text
    if (field.type === 'select' || field.type === 'radio') {
      await ctx.reply('Iltimos, yuqoridagi tugmalardan birini tanlang.');
      return;
    }
    if (field.type === 'checkbox') {
      await ctx.reply('Iltimos, "Ha" yoki "Yo\'q" tugmasini tanlang.');
      return;
    }
    if (field.type === 'phone') {
      let phone = text.replace(/[^\d]/g, '');
      if (phone.startsWith('998')) phone = phone.slice(3);
      if (!UZ_PHONE_RE.test(phone) && !UZ_PHONE_FULL_RE.test(text)) {
        await ctx.reply(
          "Telefon raqami noto'g'ri formatda. 9 ta raqam (901234567) yuboring yoki tugmadan foydalaning:",
        );
        return;
      }
      await handleAnswer(ctx, prisma, paymentLinkService, phone);
      return;
    }
    if (field.type === 'email') {
      if (!EMAIL_RE.test(text)) {
        await ctx.reply("Email manzili noto'g'ri. Qayta kiriting:");
        return;
      }
      await handleAnswer(ctx, prisma, paymentLinkService, text);
      return;
    }
    if (field.type === 'number') {
      const n = Number(text.replace(/,/g, '.'));
      if (!Number.isFinite(n)) {
        await ctx.reply("Son noto'g'ri. Qayta kiriting:");
        return;
      }
      await handleAnswer(ctx, prisma, paymentLinkService, n);
      return;
    }
    if (field.type === 'date') {
      if (!DATE_RE.test(text)) {
        await ctx.reply(
          "Sana noto'g'ri formatda. DD.MM.YYYY ko'rinishida kiriting (masalan: 15.06.2026):",
        );
        return;
      }
      await handleAnswer(ctx, prisma, paymentLinkService, text);
      return;
    }
    // text / textarea
    if (text.length < 1 || text.length > 1000) {
      await ctx.reply("Javob 1 dan 1000 belgi orasida bo'lishi kerak.");
      return;
    }
    // Ism savoliga to'liq ism-familiya yozilgan — bir marta tushuntirib qayta
    // so'raymiz, aks holda familiya ikki marta yozilib qolardi.
    if (field.mapsTo === 'firstName' && looksLikeFullName(text)) {
      await ctx.reply(MULTI_WORD_NAME_HINT);
      return;
    }
    await handleAnswer(ctx, prisma, paymentLinkService, text);
  });

  return scene;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function currentField(ctx: BotContext): FormField | null {
  const fields = ctx.session.data?.fields as FormField[] | undefined;
  const idx = ctx.session.data?.currentFieldIndex as number | undefined;
  if (!fields || idx === undefined || idx < 0 || idx >= fields.length) {
    return null;
  }
  return fields[idx];
}

async function askLevel(ctx: BotContext, levels: string[]) {
  // Lay the level buttons out 3 per row so A1..C2 fits two tidy rows.
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < levels.length; i += 3) {
    rows.push(
      levels
        .slice(i, i + 3)
        .map((lvl) => Markup.button.callback(lvl, `me_lvl:${lvl}`)),
    );
  }
  await ctx.reply(
    'Qaysi darajada imtihon topshirasiz?',
    Markup.inlineKeyboard(rows),
  );
}

async function askTime(ctx: BotContext, times: string[]) {
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < times.length; i += 3) {
    rows.push(
      times
        .slice(i, i + 3)
        .map((t) => Markup.button.callback(`🕐 ${t}`, `me_time:${t}`)),
    );
  }
  await ctx.reply(
    'Qaysi vaqtda imtihon topshirasiz?',
    Markup.inlineKeyboard(rows),
  );
}

/**
 * After the level step (or when there's none), ask the participant to pick
 * a time slot when the exam offers 2+; otherwise proceed straight to the
 * form questions. A single offered time was already auto-assigned on enter.
 */
async function startTimeOrFields(ctx: BotContext) {
  const times = (ctx.session.data.examTimes as string[]) ?? [];
  const fields = ctx.session.data.fields as FormField[];
  if (times.length > 1) {
    ctx.session.data.awaitingTime = true;
    await askTime(ctx, times);
  } else {
    await askField(ctx, fields[0]);
  }
}

async function askField(ctx: BotContext, field: FormField) {
  const requiredMark = field.required ? '' : ' (ixtiyoriy)';
  // Ism savoliga familiya keyin so'ralishini KODDA qo'shamiz. Savol matni
  // (`field.label`) bazadan keladi va har imtihonda admin tomonidan alohida
  // yoziladi — izohni faqat matnga qo'shib qo'ysak, yangi yaratilgan
  // imtihonda yana yo'qolardi.
  const hint = field.mapsTo === 'firstName' ? `\n\n${FIRST_NAME_HINT}` : '';
  const prompt = `${field.label}${requiredMark}:${hint}`;

  if (field.type === 'phone') {
    await ctx.reply(
      prompt,
      Markup.keyboard([
        [Markup.button.contactRequest("📱 Telefon raqamni yuborish")],
      ])
        .resize()
        .oneTime(),
    );
    return;
  }

  if (field.type === 'select' || field.type === 'radio') {
    const options = field.options ?? [];
    if (options.length === 0) {
      await ctx.reply(
        `${prompt}\n\n(Variantlar sozlanmagan — administrator bilan bog'laning)`,
      );
      return;
    }
    const buttons = options.map((o) => [
      Markup.button.callback(o.label || o.value, `me_opt:${o.value}`),
    ]);
    await ctx.reply(prompt, Markup.inlineKeyboard(buttons));
    return;
  }

  if (field.type === 'checkbox') {
    await ctx.reply(
      prompt,
      Markup.inlineKeyboard([
        [Markup.button.callback('Ha', 'me_opt:true')],
        [Markup.button.callback("Yo'q", 'me_opt:false')],
      ]),
    );
    return;
  }

  if (field.type === 'date') {
    await ctx.reply(
      `${prompt}\n(DD.MM.YYYY formatida, masalan: 15.06.2026)`,
      Markup.removeKeyboard(),
    );
    return;
  }

  if (field.type === 'textarea') {
    await ctx.reply(`${prompt}\n(uzun matn yozishingiz mumkin)`, Markup.removeKeyboard());
    return;
  }

  // text / number / email
  await ctx.reply(prompt, Markup.removeKeyboard());
}

async function handleAnswer(
  ctx: BotContext,
  prisma: PrismaService,
  paymentLinkService: PaymentLinkService,
  rawValue: string | number | boolean,
) {
  const field = currentField(ctx);
  if (!field) return;

  // Normalize checkbox-from-string ("true"/"false") to boolean
  let value: string | number | boolean = rawValue;
  if (field.type === 'checkbox' && typeof rawValue === 'string') {
    value = rawValue === 'true';
  }

  ctx.session.data.answers[field.id] = value;

  const fields = ctx.session.data.fields as FormField[];
  const nextIndex = (ctx.session.data.currentFieldIndex as number) + 1;
  ctx.session.data.currentFieldIndex = nextIndex;

  if (nextIndex < fields.length) {
    await askField(ctx, fields[nextIndex]);
    return;
  }

  // All fields answered — write participant
  await finalizeRegistration(ctx, prisma, paymentLinkService);
}

async function finalizeRegistration(
  ctx: BotContext,
  prisma: PrismaService,
  paymentLinkService: PaymentLinkService,
) {
  const logger = new Logger('MockExamRegistrationScene.finalize');

  const examId = ctx.session.data.examId as string;
  const examTitle = ctx.session.data.examTitle as string;
  const fields = ctx.session.data.fields as FormField[];
  const answers = ctx.session.data.answers as Record<string, unknown>;

  const fromUser = ctx.from!;
  const chatId = String(ctx.chat!.id);

  // Extract mapped values
  let firstName = '';
  let lastName = '';
  let phone = '';
  for (const f of fields) {
    const v = answers[f.id];
    if (v === undefined || v === null) continue;
    if (f.mapsTo === 'firstName' && typeof v === 'string') firstName = v.trim();
    if (f.mapsTo === 'lastName' && typeof v === 'string') lastName = v.trim();
    if (f.mapsTo === 'phone' && typeof v === 'string') phone = v;
  }

  if (!firstName || !lastName || !phone) {
    logger.error(
      `Missing required mapsTo values: firstName=${!!firstName} lastName=${!!lastName} phone=${!!phone}`,
    );
    await ctx.reply(
      "Xatolik: ism / familya / telefon olinmadi. Qaytadan urinib ko'ring (/start).",
      Markup.removeKeyboard(),
    );
    await ctx.scene.leave();
    return;
  }

  // Pricing (for the DaF discount) + the level the user chose.
  const exam = await prisma.mockExam.findFirst({
    where: { id: examId },
    select: { price: true, studentPrice: true },
  });
  const examPrice = exam?.price ?? 0;
  const studentPrice = exam?.studentPrice ?? null;
  const level = (ctx.session.data.level as string | null) ?? null;
  const examTime = (ctx.session.data.examTime as string | null) ?? null;

  let publicId: number;
  let studentId: number | null = null;
  let feeAmount = examPrice;
  let participantId: string | null = null;

  try {
    // 1. Is this person already a real DaF student? Match first by their
    //    Telegram chat, then by the phone they just entered. A phone match
    //    is a walk-in DaF student registering from a Telegram not yet tied
    //    to their profile — so we link it below. When matched, we reuse
    //    their Student.id as the publicId (balance-flow payments, results
    //    show up on the student profile) and apply the DaF mock discount.
    let existingStudent = await prisma.student.findFirst({
      where: { telegramChatId: chatId, deletedAt: null },
      select: { id: true, telegramChatId: true },
    });
    let matchedByPhone = false;
    if (!existingStudent) {
      existingStudent = await prisma.student.findFirst({
        // phone is NOT unique (see phone-login) — prefer the most recently
        // touched student when several share a number.
        where: { phone, deletedAt: null },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, telegramChatId: true },
      });
      matchedByPhone = existingStudent !== null;
    }

    if (existingStudent) {
      publicId = existingStudent.id;
      studentId = existingStudent.id;
      // Link this Telegram account to a phone-matched student that has no
      // chat id yet. Never overwrite a different existing chat id — the
      // student may use a separate Telegram account.
      if (matchedByPhone && !existingStudent.telegramChatId) {
        try {
          await prisma.student.update({
            where: { id: existingStudent.id },
            data: { telegramChatId: chatId },
          });
        } catch (err) {
          logger.warn(
            `Failed to link Telegram chat ${chatId} to student ${existingStudent.id}: ${(err as Error).message}`,
          );
        }
      }
    } else {
      // 2. Outsider — allocate a fresh public id from the shared Student
      //    sequence. NO Student row is created (mock participants aren't
      //    students). The id will become their Student.id later if an admin
      //    explicitly converts them to a student.
      const result = await prisma.$queryRaw<{ next: bigint }[]>`
        SELECT nextval('"Student_id_seq"') AS next
      `;
      publicId = Number(result[0].next);
    }

    // The fee locked in for THIS registration — DaF discount applied when
    // the registrant matched a student. Billing / gateway / links all read
    // this from the row so the amount never drifts.
    feeAmount = resolveParticipantFee(
      { price: examPrice, studentPrice },
      studentId !== null,
    );

    const created = await prisma.mockExamParticipant.create({
      data: {
        // Same single-tenant constant the fee settlement below uses. The column
        // default that used to supply this is gone — a multi-company schema must
        // not have one company baked into it.
        companyId: DEFAULT_COMPANY_ID,
        examId,
        publicId,
        studentId,
        level,
        examTime,
        feeAmount,
        telegramChatId: chatId,
        telegramUsername: fromUser.username ?? null,
        telegramFirstName: fromUser.first_name ?? null,
        telegramLastName: fromUser.last_name ?? null,
        firstName,
        lastName,
        phone,
        formData: answers as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    participantId = created.id;
  } catch (error) {
    // Unique constraint (examId, publicId) — already registered race
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      await ctx.reply(
        "Siz allaqachon ushbu imtihonga ro'yxatga olingansiz.",
        Markup.removeKeyboard(),
      );
      await ctx.scene.leave();
      return;
    }
    logger.error(`Failed to create participant: ${(error as Error).message}`);
    await ctx.reply(
      "Xatolik yuz berdi. Keyinroq qayta urinib ko'ring yoki administrator bilan bog'laning.",
      Markup.removeKeyboard(),
    );
    await ctx.scene.leave();
    return;
  }

  // `feeAmount` (computed above) is what this participant owes — the DaF
  // discount is already baked in.
  const price = feeAmount;

  const lines: string[] = [
    `✅ Siz "${examTitle}" imtihoniga muvaffaqiyatli ro'yxatga olindingiz.`,
    '',
    `🆔 Sizning identifikatoringiz: <b>${publicId}</b>`,
  ];
  if (examTime) {
    lines.push(`🕐 Tanlangan vaqt: <b>${examTime}</b>`);
  }

  // Build the payment keyboard. Payme/Click are URL buttons (open the
  // provider app/web checkout with merchant id + amount pre-filled), and
  // "Naqd (markazda)" sits alongside for paying on arrival.
  //
  // EVERY registrant sees this, DaF students included. A branch used to skip
  // it: their lesson balance was deducted a few lines above, so they were
  // never offered a choice — just told afterwards that the money had gone.
  // That balance is prepayment for LESSONS, and the fee was usually collected
  // in cash at the desk as well, so 21 students on the August 2026 exam paid
  // twice. Do not add a path that pays a mock fee without the payer choosing it.
  type KbButton =
    | ReturnType<typeof Markup.button.url>
    | ReturnType<typeof Markup.button.callback>;
  const keyboardRows: KbButton[][] = [];
  let hasPayLinks = false;
  if (price > 0) {
    try {
      const links = await paymentLinkService.buildLinks(publicId, price);
      const payRow: KbButton[] = [];
      if (links.payme) {
        payRow.push(Markup.button.url('💳 Payme', links.payme));
      }
      if (links.click) {
        payRow.push(Markup.button.url('💳 Click', links.click));
      }
      if (payRow.length > 0) {
        keyboardRows.push(payRow);
        hasPayLinks = true;
      }
    } catch (err) {
      logger.warn(
        `Failed to build payment links for participant publicId=${publicId}: ${(err as Error).message}`,
      );
    }
    // Cash option — only when we know which participant to mark.
    if (participantId) {
      keyboardRows.push([
        Markup.button.callback('💵 Naqd (markazda)', `me_cash:${participantId}`),
      ]);
    }
  }

  if (price > 0) {
    lines.push('', `💳 To'lov: <b>${price.toLocaleString('uz-UZ')} so'm</b>`);
    if (hasPayLinks) {
      lines.push(
        "Payme yoki Click tugmasi orqali to'lang (telefoningizda app ochiladi), " +
          'yoki naqd pul bilan to\'lamoqchi bo\'lsangiz «💵 Naqd (markazda)» tugmasini bosing.',
      );
    } else {
      lines.push(
        `Payme yoki Click orqali <b>${publicId}</b> raqamiga to'lang, ` +
          'yoki naqd uchun «💵 Naqd (markazda)» tugmasini bosing.',
      );
    }
  }
  lines.push(
    '',
    "Natijalar e'lon qilingach, PDFda identifikatoringizni topishingiz mumkin. Eslab qoling!",
  );

  // Telefon so'ralganda qo'yilgan «📱 Telefon raqamni yuborish» klaviaturasi
  // shu yerda albatta tozalanishi kerak. Bitta xabarda ham inline tugmalar,
  // ham `remove_keyboard` bo'lolmaydi (Telegram'da `reply_markup` bitta) —
  // shuning uchun pullik imtihonda xabar IKKIGA bo'linadi.
  //
  // Ilgari bu shart faqat `keyboardRows.length === 0` bo'lganda bajarilardi,
  // ya'ni PULLIK imtihonga yozilgan har bir odamda telefon klaviaturasi
  // ekranda yopishib qolardi (telefon oxirgi savol bo'lgani uchun undan keyin
  // klaviaturani tozalaydigan boshqa so'rov bo'lmasdi).
  if (keyboardRows.length > 0) {
    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      ...Markup.removeKeyboard(),
    });
    await ctx.reply(
      "To'lov usulini tanlang:",
      Markup.inlineKeyboard(keyboardRows),
    );
  } else {
    await ctx.reply(lines.join('\n'), {
      parse_mode: 'HTML',
      ...Markup.removeKeyboard(),
    });
  }
  await ctx.scene.leave();
}

function buildIntroMessage(exam: {
  title: string;
  description: string | null;
  examDate: Date | null;
}): string {
  const lines: string[] = [
    `📋 "${exam.title}"`,
    "",
    "Ro'yxatga olish boshlandi. Quyidagi savollarga javob bering.",
  ];
  if (exam.description) {
    lines.unshift(exam.description, '');
  }
  if (exam.examDate) {
    lines.push('', `🗓️ Imtihon sanasi: ${exam.examDate.toLocaleDateString('uz-UZ')}`);
  }
  lines.push('', 'Bekor qilish uchun /cancel.');
  return lines.join('\n');
}
