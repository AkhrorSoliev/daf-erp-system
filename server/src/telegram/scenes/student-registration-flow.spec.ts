import { registerStudentFromTelegram } from './student-registration-flow';
import { SELF_SIGNUP_SOURCE } from '../../common/student-origin';
import { DEFAULT_COMPANY_ID } from '../constants';

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));

/**
 * Telegram boti orqali ro'yxatdan o'tgan o'quvchi lid yozuvi qoldiradi.
 *
 * Bu yo'l 10.09.2026 deploydan keyin 16 o'quvchidan 13 tasini lidsiz qoldirdi:
 * u `/students` eshigidan o'tmay bazaga to'g'ridan yozardi. Qorovul
 * (`student-origin.single-source.spec.ts`) faqat chaqiruv faylda BORLIGINI
 * ko'radi — bu test uning haqiqatan, to'g'ri qiymatlar bilan va O'SHA
 * tranzaksiya ichida ishlashini tekshiradi.
 */
describe('registerStudentFromTelegram — lid kelib chiqishi', () => {
  const data = {
    firstName: 'Ozodbek',
    lastName: 'Kamolov',
    phone: '901112233',
    photo: 'https://r2/photo.jpg',
    branchId: 7,
    groupId: 'group-1',
    groupName: 'A1-1',
  };

  let tx: any;
  let prisma: any;
  let leadOrigin: { recordSelfSignupOrigin: jest.Mock };
  let history: any;

  beforeEach(() => {
    tx = {
      student: {
        create: jest.fn().mockResolvedValue({
          id: 11094,
          firstName: 'Ozodbek',
          lastName: 'Kamolov',
          phone: '901112233',
        }),
      },
    };
    prisma = {
      $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
      enrollment: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'enr-1', createdAt: new Date() }),
      },
      enrollmentStateLog: { create: jest.fn().mockResolvedValue({}) },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 20001 }),
      },
      student: { update: jest.fn().mockResolvedValue({}) },
    };
    leadOrigin = {
      recordSelfSignupOrigin: jest
        .fn()
        .mockResolvedValue({ kind: 'created', leadId: 'lead-1' }),
    };
    history = { recordCreate: jest.fn().mockResolvedValue(undefined) };
  });

  const run = () =>
    registerStudentFromTelegram(
      prisma,
      history,
      leadOrigin as never,
      data,
      '555000',
    );

  it('writes the join day as the enrollment start date', async () => {
    // Without it the first monthly charge reached back to the 1st of the
    // month and billed a student who joined mid-month for the whole month.
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T20:30:00.000Z'));
    try {
      await run();
    } finally {
      jest.useRealTimers();
    }

    expect(prisma.enrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'group-1',
        // 20:30 UTC on 24.09 is already 25.09 in Tashkent.
        startDate: new Date('2026-09-25T00:00:00.000Z'),
      }),
    });
  });

  it("lidni o'quvchi bilan BITTA tranzaksiya ichida yozadi", async () => {
    await run();

    expect(leadOrigin.recordSelfSignupOrigin).toHaveBeenCalledTimes(1);
    const [passedTx] = leadOrigin.recordSelfSignupOrigin.mock.calls[0];
    // Referens tengligi: lid yozuvi prisma emas, o'quvchi yaratilgan tx orqali.
    expect(passedTx).toBe(tx);
  });

  it("yaratilgan o'quvchining ma'lumotlari va bot manbasi bilan chaqiradi", async () => {
    await run();

    const [, params, sourceName] =
      leadOrigin.recordSelfSignupOrigin.mock.calls[0];
    expect(params).toEqual({
      studentId: 11094,
      firstName: 'Ozodbek',
      lastName: 'Kamolov',
      phone: '901112233',
      branchId: 7,
      companyId: DEFAULT_COMPANY_ID,
      userId: undefined,
    });
    expect(sourceName).toBe(SELF_SIGNUP_SOURCE.TELEGRAM_BOT);
  });

  it("lid yozuvi yiqilsa ro'yxatdan o'tish ham to'xtaydi", async () => {
    leadOrigin.recordSelfSignupOrigin.mockRejectedValue(
      new Error('lid yozilmadi'),
    );

    await expect(run()).rejects.toThrow('lid yozilmadi');
    // Tranzaksiyadan keyingi hech narsa ishlamaydi — guruhga yozish ham,
    // login yaratish ham. Real Prisma o'quvchi qatorini ham orqaga qaytaradi.
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("kirish nomi bo'sh bo'lsa telefon yoziladi", async () => {
    await run();
    expect(prisma.user.create.mock.calls[0][0].data.login).toBe('901112233');
  });

  it("kirish nomi band bo'lsa ham o'quvchi hisobi ochiladi — nomsiz", async () => {
    // Prodda 4 o'quvchi aynan shu sabab kirish hisobisiz qolgan edi.
    prisma.user.findFirst.mockResolvedValue({ id: 10018 });

    await run();

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.user.create.mock.calls[0][0].data.login).toBeNull();
    expect(prisma.student.update).toHaveBeenCalledWith({
      where: { id: 11094 },
      data: { userId: 20001 },
    });
  });
});
