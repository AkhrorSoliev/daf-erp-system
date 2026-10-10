import { registerStudentFromTelegram } from './student-registration-flow';
import { SELF_SIGNUP_SOURCE } from '../../common/student-origin';
import { DEFAULT_COMPANY_ID } from '../constants';
import { STUDENT_SELF_ENROLLED } from '../../common/events/self-enrollment.events';

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
  let events: { emitAsync: jest.Mock };

  beforeEach(() => {
    // Every write goes through the transaction: `prisma` has nothing else,
    // so a write outside it would throw here.
    tx = {
      student: {
        create: jest.fn().mockResolvedValue({
          id: 11094,
          firstName: 'Ozodbek',
          lastName: 'Kamolov',
          phone: '901112233',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
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
    };
    prisma = {
      $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
    };
    leadOrigin = {
      recordSelfSignupOrigin: jest
        .fn()
        .mockResolvedValue({ kind: 'created', leadId: 'lead-1' }),
    };
    history = { recordCreate: jest.fn().mockResolvedValue(undefined) };
    events = { emitAsync: jest.fn().mockResolvedValue([]) };
  });

  const run = () =>
    registerStudentFromTelegram(
      prisma,
      history,
      leadOrigin as never,
      data,
      '555000',
      events,
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

    expect(tx.enrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: 'group-1',
        // 20:30 UTC on 24.09 is already 25.09 in Tashkent.
        startDate: new Date('2026-09-25T00:00:00.000Z'),
      }),
    });
  });

  it('asks billing to charge the join month as soon as the enrollment exists', async () => {
    // The admin door charges inside its own transaction; this one waited for
    // the 04:00 daily run, so five students who signed up on 30.09.2026 after
    // that run were never billed for September.
    await run();

    expect(events.emitAsync).toHaveBeenCalledWith(STUDENT_SELF_ENROLLED, {
      enrollmentId: 'enr-1',
      companyId: DEFAULT_COMPANY_ID,
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
    // Keyingi hech narsa ishlamaydi — guruhga yozish ham, login yaratish ham.
    // Real Prisma o'quvchi qatorini ham orqaga qaytaradi.
    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("kirish nomi bo'sh bo'lsa telefon yoziladi", async () => {
    await run();
    expect(tx.user.create.mock.calls[0][0].data.login).toBe('901112233');
  });

  it("kirish nomi band bo'lsa ham o'quvchi hisobi ochiladi — nomsiz", async () => {
    // Prodda 4 o'quvchi aynan shu sabab kirish hisobisiz qolgan edi.
    tx.user.findFirst.mockResolvedValue({ id: 10018 });

    await run();

    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.user.create.mock.calls[0][0].data.login).toBeNull();
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 11094 },
      data: { userId: 20001 },
    });
  });

  it('runs the caller step inside the card transaction, with the new id', async () => {
    const inTx = jest.fn().mockResolvedValue(undefined);

    await registerStudentFromTelegram(
      prisma,
      history,
      leadOrigin as never,
      data,
      '555000',
      events,
      { actorId: 10002, inTx },
    );

    expect(inTx).toHaveBeenCalledWith(tx, 11094);
  });

  it('writes nothing after the transaction when the caller step refuses', async () => {
    const inTx = jest.fn().mockRejectedValue(new Error('allaqachon'));

    await expect(
      registerStudentFromTelegram(
        prisma,
        history,
        leadOrigin as never,
        data,
        '555000',
        events,
        { actorId: 10002, inTx },
      ),
    ).rejects.toThrow('allaqachon');
    expect(tx.enrollment.create).not.toHaveBeenCalled();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(history.recordCreate).not.toHaveBeenCalled();
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('writes the group, its state log and the account in the card transaction', async () => {
    await run();

    expect(tx.enrollment.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollmentStateLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        enrollmentId: 'enr-1',
        status: 'ACTIVE',
      }),
    });
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 11094 },
      data: { userId: 20001 },
    });
  });

  it('a failing account leaves nothing after the card: no history, no charge, no commit signal', async () => {
    // A login collision or a dropped connection while the account is opened:
    // the card, its group and its state log were written on `tx`, so the
    // rollback takes them too, and nothing after the commit runs.
    tx.user.create.mockRejectedValue(new Error('hisob ochilmadi'));
    const onCommit = jest.fn();

    await expect(
      registerStudentFromTelegram(
        prisma,
        history,
        leadOrigin as never,
        data,
        '555000',
        events,
        { actorId: 10002, inTx: jest.fn(), onCommit },
      ),
    ).rejects.toThrow('hisob ochilmadi');
    expect(tx.enrollment.create).toHaveBeenCalledTimes(1);
    expect(tx.enrollmentStateLog.create).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(history.recordCreate).not.toHaveBeenCalled();
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('signals the commit before the history rows and the charge event', async () => {
    const onCommit = jest.fn();

    await registerStudentFromTelegram(
      prisma,
      history,
      leadOrigin as never,
      data,
      '555000',
      events,
      { onCommit },
    );

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.invocationCallOrder[0]).toBeLessThan(
      events.emitAsync.mock.invocationCallOrder[0],
    );
    expect(onCommit.mock.invocationCallOrder[0]).toBeLessThan(
      history.recordCreate.mock.invocationCallOrder[0],
    );
  });

  it('records the approving administrator on the lead and on every history row', async () => {
    await registerStudentFromTelegram(
      prisma,
      history,
      leadOrigin as never,
      data,
      '555000',
      events,
      { actorId: 10002 },
    );

    expect(leadOrigin.recordSelfSignupOrigin.mock.calls[0][1].userId).toBe(
      10002,
    );
    for (const [row] of history.recordCreate.mock.calls) {
      expect(row.changedById).toBe(10002);
    }
  });
});
