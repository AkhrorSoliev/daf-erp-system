import { Context } from 'telegraf';
import type { UserFromGetMe } from 'telegraf/types';
import { createMockExamRegistrationScene } from './mock-exam-registration.scene';
import { CONTACT_NOT_OWN } from '../utils/contact-ownership';

const BOT_INFO = {
  id: 1,
  is_bot: true,
  first_name: 'test-bot',
  username: 'test_bot',
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
} as UserFromGetMe;

/**
 * Mock imtihon formasi telefon maydonida turibdi. Bu sahna telefon bo'yicha
 * mavjud o'quvchini topib chatni unga BOG'LAYDI — ya'ni begona karta bilan
 * begona o'quvchining Telegram bog'lanishini egallab bo'lardi.
 */
function buildContactCtx(
  contact: { phone_number: string; first_name: string; user_id?: number },
  fromId = 999,
) {
  const update = {
    update_id: 5,
    message: {
      message_id: 5,
      date: 0,
      chat: { id: 555555, type: 'private' },
      from: { id: fromId, is_bot: false, first_name: 'M' },
      contact,
    },
  };
  const ctx = new Context(update as any, {} as any, BOT_INFO) as any;
  ctx.session = {
    step: 0,
    data: {
      examId: 'exam-1',
      fields: [
        {
          id: 'phone',
          type: 'phone',
          label: 'Telefon',
          required: true,
          mapsTo: 'phone',
        },
      ],
      currentFieldIndex: 0,
      answers: {},
    },
    processing: false,
  };
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

describe('mock-exam-registration.scene — kontakt qadami', () => {
  it('begona karta rad etiladi, bazaga borilmaydi', async () => {
    const prisma = {
      student: { findFirst: jest.fn(), update: jest.fn() },
      mockExamParticipant: { findFirst: jest.fn(), create: jest.fn() },
    } as any;
    const scene = createMockExamRegistrationScene(
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );
    const ctx = buildContactCtx({
      phone_number: '+998901112233',
      first_name: 'M',
      user_id: 1,
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it("user_id'siz karta rad etiladi", async () => {
    const prisma = {
      student: { findFirst: jest.fn(), update: jest.fn() },
      mockExamParticipant: { findFirst: jest.fn(), create: jest.fn() },
    } as any;
    const scene = createMockExamRegistrationScene(
      prisma,
      {} as any,
      {} as any,
      {} as any,
    );
    const ctx = buildContactCtx({
      phone_number: '+998901112233',
      first_name: 'M',
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.reply.mock.calls[0][0]).toBe(CONTACT_NOT_OWN);
    expect(prisma.student.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Ro'yxat yakuni (finalize)
// ---------------------------------------------------------------------------

const FORM_FIELDS = [
  { id: 'fn', type: 'text', label: 'Ism', required: true, mapsTo: 'firstName' },
  {
    id: 'ln',
    type: 'text',
    label: 'Familiya',
    required: true,
    mapsTo: 'lastName',
  },
  {
    id: 'phone',
    type: 'phone',
    label: 'Telefon',
    required: true,
    mapsTo: 'phone',
  },
];

type StudentRow = { id: number; phone: string; telegramChatId: string | null };

function buildFinalizeEnv(opts: {
  students?: StudentRow[];
  exam?: Record<string, unknown>;
}) {
  const students = opts.students ?? [];
  const prisma = {
    mockExam: {
      findFirst: jest.fn().mockResolvedValue({
        price: 40000,
        studentPrice: 30000,
        companyId: 1001,
        status: 'REGISTRATION_OPEN',
        registrationDeadline: null,
        ...opts.exam,
      }),
    },
    student: {
      findFirst: jest.fn(async ({ where }: any) => {
        if (where.telegramChatId !== undefined) {
          return (
            students.find((s) => s.telegramChatId === where.telegramChatId) ??
            null
          );
        }
        return students.find((s) => s.phone === where.phone) ?? null;
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    mockExamParticipant: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'part-new' }),
    },
    $queryRaw: jest.fn().mockResolvedValue([{ next: BigInt(10900) }]),
  } as any;
  const links = {
    buildLinks: jest
      .fn()
      .mockResolvedValue({ payme: null, click: null, amount: 0 }),
  } as any;
  const history = { recordCreate: jest.fn(), recordUpdate: jest.fn() } as any;
  const scene = createMockExamRegistrationScene(
    prisma,
    links,
    history,
    {} as any,
  );
  return { prisma, scene, history };
}

function sessionAtPhoneStep() {
  return {
    step: 0,
    data: {
      examId: 'exam-1',
      examTitle: 'Mock A1',
      fields: FORM_FIELDS,
      currentFieldIndex: 2,
      answers: { fn: 'Ali', ln: 'Valiyev' },
      level: null,
      examTime: null,
    },
    processing: false,
  };
}

function buildUpdateCtx(update: Record<string, unknown>) {
  const ctx = new Context(
    { update_id: 7, ...update } as any,
    {} as any,
    BOT_INFO,
  ) as any;
  ctx.session = sessionAtPhoneStep();
  ctx.scene = { leave: jest.fn().mockResolvedValue(undefined) };
  ctx.reply = jest.fn().mockResolvedValue(undefined);
  ctx.answerCbQuery = jest.fn().mockResolvedValue(undefined);
  return ctx;
}

const CHAT = { id: 555555, type: 'private' };
const FROM = { id: 999, is_bot: false, first_name: 'M' };

const typedPhoneCtx = (text: string) =>
  buildUpdateCtx({
    message: { message_id: 7, date: 0, chat: CHAT, from: FROM, text },
  });

const ownContactCtx = (phone: string) =>
  buildUpdateCtx({
    message: {
      message_id: 7,
      date: 0,
      chat: CHAT,
      from: FROM,
      contact: { phone_number: phone, first_name: 'M', user_id: FROM.id },
    },
  });

describe("mock-exam-registration.scene — ro'yxat yakuni", () => {
  /**
   * XAVFSIZLIK: qo'lda yozilgan raqam hech narsani isbotlamaydi. Ilgari bot
   * shu raqam bo'yicha o'quvchini topib, uning bo'sh `telegramChatId`siga
   * begona chatni yozardi — keyin o'sha chat "Parolni tiklash" orqali
   * o'quvchining yangi parolini olardi yoki ilovaga uning nomidan kirardi.
   */
  it("qo'lda yozilgan raqam o'quvchi profiliga chatni BOG'LAMAYDI", async () => {
    const { prisma, scene } = buildFinalizeEnv({
      students: [{ id: 10050, phone: '901112233', telegramChatId: null }],
    });
    const ctx = typedPhoneCtx('901112233');

    await scene.middleware()(ctx, async () => {});

    expect(prisma.mockExamParticipant.create).toHaveBeenCalled();
    expect(prisma.student.update).not.toHaveBeenCalled();
  });

  it("o'z kontaktini tugma bilan yuborgan o'quvchining chati bog'lanadi", async () => {
    const { prisma, scene, history } = buildFinalizeEnv({
      students: [{ id: 10050, phone: '901112233', telegramChatId: null }],
    });
    const ctx = ownContactCtx('+998901112233');

    await scene.middleware()(ctx, async () => {});

    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 10050 },
      data: { telegramChatId: String(CHAT.id) },
    });
    // Bog'lanish izsiz qolmasin — kim, qachon, qaysi chatni bog'lagani.
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Student',
        entityId: 10050,
        newValues: expect.objectContaining({
          telegramChatId: String(CHAT.id),
        }),
      }),
    );
  });

  it("bot orqali ro'yxatdan o'tish tarixga yoziladi", async () => {
    const { scene, history } = buildFinalizeEnv({});
    const ctx = typedPhoneCtx('901112233');

    await scene.middleware()(ctx, async () => {});

    expect(history.recordCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'MockExamParticipant',
        entityId: 'part-new',
        companyId: 1001,
      }),
    );
  });

  it("forma to'ldirilguncha ro'yxat yopilgan bo'lsa, ishtirokchi yaratilmaydi", async () => {
    const { prisma, scene } = buildFinalizeEnv({
      exam: { status: 'REGISTRATION_CLOSED' },
    });
    const ctx = typedPhoneCtx('901112233');

    await scene.middleware()(ctx, async () => {});

    expect(prisma.mockExamParticipant.create).not.toHaveBeenCalled();
    expect(ctx.scene.leave).toHaveBeenCalled();
  });

  it("forma to'ldirilguncha muddat o'tib ketsa, ishtirokchi yaratilmaydi", async () => {
    const { prisma, scene } = buildFinalizeEnv({
      exam: { registrationDeadline: new Date(Date.now() - 60_000) },
    });
    const ctx = typedPhoneCtx('901112233');

    await scene.middleware()(ctx, async () => {});

    expect(prisma.mockExamParticipant.create).not.toHaveBeenCalled();
  });

  /**
   * Ota-onaning Telegram'i A farzandga bog'langan, u B farzandni B ning
   * raqami bilan yozmoqda. Ilgari chat bo'yicha topilgan A ustun kelardi:
   * B A ning nomiga, A ning chegirmasi va natijalar profili bilan yozilardi.
   */
  it("yozilgan raqam boshqa bo'lsa, chatga bog'langan o'quvchi olinmaydi", async () => {
    const { prisma, scene } = buildFinalizeEnv({
      students: [
        { id: 10050, phone: '901111111', telegramChatId: String(CHAT.id) },
      ],
    });
    const ctx = typedPhoneCtx('902222222');

    await scene.middleware()(ctx, async () => {});

    const data = prisma.mockExamParticipant.create.mock.calls[0][0].data;
    expect(data.studentId).toBeNull();
    expect(data.publicId).toBe(10900);
    expect(data.feeAmount).toBe(40000);
  });

  it("o'quvchi imtihon kompaniyasi ichidan qidiriladi", async () => {
    const { prisma, scene } = buildFinalizeEnv({});
    const ctx = typedPhoneCtx('901112233');

    await scene.middleware()(ctx, async () => {});

    for (const [arg] of prisma.student.findFirst.mock.calls) {
      expect(arg.where).toEqual(expect.objectContaining({ companyId: 1001 }));
    }
    expect(prisma.student.findFirst).toHaveBeenCalled();
  });

  it('oldingi savolning tugmasi joriy (telefon) savolga yozilmaydi', async () => {
    const { prisma, scene } = buildFinalizeEnv({});
    const ctx = buildUpdateCtx({
      callback_query: {
        id: 'cb1',
        from: FROM,
        chat_instance: 'x',
        data: 'me_opt:true',
        message: { message_id: 3, date: 0, chat: CHAT },
      },
    });

    await scene.middleware()(ctx, async () => {});

    expect(ctx.session.data.answers.phone).toBeUndefined();
    expect(ctx.session.data.currentFieldIndex).toBe(2);
    expect(prisma.mockExamParticipant.create).not.toHaveBeenCalled();
  });
});
