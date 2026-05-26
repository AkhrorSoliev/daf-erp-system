import { Logger } from '@nestjs/common';
import { Scenes, Markup, Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { MockExamStatus, Prisma } from '@prisma/client';
import { BotContext } from '../types/context';
import { SCENES } from '../constants';
import { PrismaService } from '../../prisma/prisma.service';
import { MockExamBillingService } from '../../mock-exams/mock-exam-billing.service';
import { PaymentLinkService } from '../../payment-gateways/payment-link.service';

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

export function createMockExamRegistrationScene(
  prisma: PrismaService,
  mockExamBilling: MockExamBillingService,
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

    ctx.session.data = {
      examId: exam.id,
      examTitle: exam.title,
      fields,
      currentFieldIndex: 0,
      answers: {},
    };

    const intro = buildIntroMessage(exam);
    await ctx.reply(intro, Markup.removeKeyboard());
    await askField(ctx, fields[0]);
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

  // Inline button selection (select / radio / checkbox)
  scene.action(/^me_opt:(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const value = ctx.match[1];
    await handleAnswer(ctx, prisma, mockExamBilling, paymentLinkService, value);
  });

  // Phone share via Telegram Contact
  scene.on(message('contact'), async (ctx) => {
    const field = currentField(ctx);
    if (!field || field.type !== 'phone') return;

    let phone = ctx.message.contact.phone_number.replace(/[^\d]/g, '');
    if (phone.startsWith('998')) phone = phone.slice(3);
    if (!UZ_PHONE_RE.test(phone)) {
      await ctx.reply(
        "Telefon raqami noto'g'ri formatda. Yana urinib ko'ring:",
      );
      return;
    }
    await handleAnswer(ctx, prisma, mockExamBilling, paymentLinkService, phone);
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
      await handleAnswer(ctx, prisma, mockExamBilling, paymentLinkService, phone);
      return;
    }
    if (field.type === 'email') {
      if (!EMAIL_RE.test(text)) {
        await ctx.reply("Email manzili noto'g'ri. Qayta kiriting:");
        return;
      }
      await handleAnswer(ctx, prisma, mockExamBilling, paymentLinkService, text);
      return;
    }
    if (field.type === 'number') {
      const n = Number(text.replace(/,/g, '.'));
      if (!Number.isFinite(n)) {
        await ctx.reply("Son noto'g'ri. Qayta kiriting:");
        return;
      }
      await handleAnswer(ctx, prisma, mockExamBilling, paymentLinkService, n);
      return;
    }
    if (field.type === 'date') {
      if (!DATE_RE.test(text)) {
        await ctx.reply(
          "Sana noto'g'ri formatda. DD.MM.YYYY ko'rinishida kiriting (masalan: 15.06.2026):",
        );
        return;
      }
      await handleAnswer(ctx, prisma, mockExamBilling, paymentLinkService, text);
      return;
    }
    // text / textarea
    if (text.length < 1 || text.length > 1000) {
      await ctx.reply("Javob 1 dan 1000 belgi orasida bo'lishi kerak.");
      return;
    }
    await handleAnswer(ctx, prisma, mockExamBilling, paymentLinkService, text);
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

async function askField(ctx: BotContext, field: FormField) {
  const requiredMark = field.required ? '' : ' (ixtiyoriy)';
  const prompt = `${field.label}${requiredMark}:`;

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
  mockExamBilling: MockExamBillingService,
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
  await finalizeRegistration(ctx, prisma, mockExamBilling, paymentLinkService);
}

async function finalizeRegistration(
  ctx: BotContext,
  prisma: PrismaService,
  mockExamBilling: MockExamBillingService,
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

  let publicId: number;
  let studentId: number | null = null;

  try {
    // 1. Is this person already a real DaF student? Match by Telegram chat.
    //    If yes, we reuse their Student.id as the publicId — they pay via
    //    the normal Student.balance flow and mock results show up on their
    //    student profile.
    const existingStudent = await prisma.student.findFirst({
      where: { telegramChatId: chatId, deletedAt: null },
      select: { id: true },
    });

    if (existingStudent) {
      publicId = existingStudent.id;
      studentId = existingStudent.id;
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

    // 3. Optionally surface the registration to the marketing/sales team
    //    by stamping any matching Lead. The Lead itself stays in the
    //    Kanban — we only flag that this person also signed up for a mock.
    //    Implemented as a phone-based lookup so the Lead UI can derive the
    //    link without an extra FK (see Lead detail view in frontend).

    await prisma.mockExamParticipant.create({
      data: {
        examId,
        publicId,
        studentId,
        telegramChatId: chatId,
        telegramUsername: fromUser.username ?? null,
        telegramFirstName: fromUser.first_name ?? null,
        telegramLastName: fromUser.last_name ?? null,
        firstName,
        lastName,
        phone,
        formData: answers as Prisma.InputJsonValue,
      },
    });
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

  // If this is a DaF student, try to settle the mock fee from their
  // balance immediately. Saves them an extra payment step when they
  // already have funds. Failures here are non-fatal — registration
  // succeeded either way; the user can still pay via Payme/Click later.
  let autoPaid = false;
  if (studentId !== null) {
    try {
      const result = await mockExamBilling.tryDeductForStudent({
        studentId,
        companyId: 1001, // DEFAULT_COMPANY_ID — bot is single-tenant for now
      });
      autoPaid = result.paidCount > 0;
    } catch (err) {
      logger.warn(
        `Auto-deduct from balance failed for student ${studentId}: ${(err as Error).message}`,
      );
    }
  }

  // Look up the exam price so the message tells the user what to pay.
  const exam = await prisma.mockExam.findFirst({
    where: { id: examId },
    select: { price: true },
  });
  const price = exam?.price ?? 0;

  const lines: string[] = [
    `✅ Siz "${examTitle}" imtihoniga muvaffaqiyatli ro'yxatga olindingiz.`,
    '',
    `🆔 Sizning identifikatoringiz: <b>${publicId}</b>`,
  ];

  // Build payment deep-link buttons when there's a fee and the
  // participant isn't already paid (auto-deducted DaF students skip
  // this). Each button is a Telegram URL button: tapping it opens the
  // provider's app (when installed) or web checkout. Merchant id +
  // amount are pre-filled — the user just confirms the payment.
  let paymentButtons: Array<Array<{ text: string; url: string }>> = [];
  if (!autoPaid && price > 0) {
    try {
      const links = await paymentLinkService.buildLinks(publicId, price);
      const row: Array<{ text: string; url: string }> = [];
      if (links.payme) {
        row.push({ text: '💳 Payme orqali to\'lash', url: links.payme });
      }
      if (links.click) {
        row.push({ text: '💳 Click orqali to\'lash', url: links.click });
      }
      if (row.length > 0) paymentButtons = [row];
    } catch (err) {
      logger.warn(
        `Failed to build payment links for participant publicId=${publicId}: ${(err as Error).message}`,
      );
    }
  }

  if (autoPaid) {
    lines.push('', `💳 To'lov balansingizdan yechib olindi (${price} so'm).`);
  } else if (price > 0) {
    lines.push('', `💳 To'lov: <b>${price.toLocaleString('uz-UZ')} so'm</b>`);
    if (paymentButtons.length > 0) {
      lines.push("Quyidagi tugma orqali to'lang — telefoningizda app ochiladi:");
    } else {
      lines.push(
        `Payme yoki Click orqali <b>${publicId}</b> raqamiga to'lang.`,
      );
    }
  }
  lines.push(
    '',
    "Natijalar e'lon qilingach, PDFda identifikatoringizni topishingiz mumkin. Eslab qoling!",
  );

  const replyOptions: Parameters<typeof ctx.reply>[1] = {
    parse_mode: 'HTML',
    ...(paymentButtons.length > 0
      ? Markup.inlineKeyboard(
          paymentButtons.map((row) =>
            row.map((btn) => Markup.button.url(btn.text, btn.url)),
          ),
        )
      : Markup.removeKeyboard()),
  };

  await ctx.reply(lines.join('\n'), replyOptions);
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
