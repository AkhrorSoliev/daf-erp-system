import {
  AbsencePauseNotifyService,
  type PauseTarget,
} from './absence-pause-notify.service';

describe('AbsencePauseNotifyService — what the messages claim', () => {
  const STUDENT_CHAT = '123';
  const STAFF_CHAT = '777';

  const target: PauseTarget = {
    enrollmentId: 'e-10001',
    studentId: 10001,
    streak: 1,
    companyId: 1001,
    student: {
      id: 10001,
      firstName: 'Ali',
      lastName: 'Valiyev',
      telegramChatId: STUDENT_CHAT,
    },
    group: {
      id: 'g-1',
      name: '#001',
      branchId: 1,
      branchPhone: '905351099',
      teachers: [{ teacherId: 500 }],
    },
  };

  function makeService() {
    const sendMessage = jest.fn().mockResolvedValue({});
    const push = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      user: {
        // One staff member on Telegram, so stages 2 and 3 also send their
        // staff copy and it is checked alongside the student's.
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 20001, telegramChatId: STAFF_CHAT }]),
      },
    };
    const service = new AbsencePauseNotifyService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({ id: 1 }) } as never,
      { sendToUser: jest.fn() } as never,
      push as never,
      { getBot: () => ({ telegram: { sendMessage } }) } as never,
    );
    return { service, sendMessage, push };
  }

  function textsSentTo(sendMessage: jest.Mock, chatId: string): string[] {
    return sendMessage.mock.calls
      .filter(([to]) => to === chatId)
      .map(([, text]) => text as string);
  }

  // `Attendance.date` is a `@db.Date`; AbsenceStreakService hands it over as
  // UTC midnight of that calendar day.
  const LESSON_DAY = new Date('2026-09-19T00:00:00.000Z');
  // 20:30 on 19.09 in Tashkent — the evening run, on the lesson's own day.
  const SAME_EVENING = new Date('2026-09-19T15:30:00.000Z');
  // 07:30 on 20.09 in Tashkent — the morning run, a day later.
  const NEXT_MORNING = new Date('2026-09-20T02:30:00.000Z');

  async function stageOneText(now: Date): Promise<string> {
    const { service, sendMessage } = makeService();
    await service.nudgeStudent(target, LESSON_DAY, now);
    const texts = textsSentTo(sendMessage, STUDENT_CHAT);
    expect(texts).toHaveLength(1);
    return texts[0];
  }

  it('stage 1 says "today" when it is sent on the lesson day', async () => {
    expect(await stageOneText(SAME_EVENING)).toMatch(/\bbugun\b/i);
  });

  it('stage 1 names the date when the lesson was on an earlier day', async () => {
    const text = await stageOneText(NEXT_MORNING);
    expect(text).toContain('19.09.2026');
    expect(text).not.toMatch(/\b(bugun|kecha)/i);
  });

  it('stage 1 decides "today" by the Tashkent day, not the UTC day', async () => {
    // 19:30 UTC on 19.09 is already 00:30 on 20.09 in Tashkent.
    const text = await stageOneText(new Date('2026-09-19T19:30:00.000Z'));
    expect(text).toContain('19.09.2026');
    expect(text).not.toMatch(/\bbugun\b/i);
  });

  // Stages 2 and 3 count lessons and never say which day, so they stay true
  // whichever run sends them and however long the message sits in the chat.
  it.each<[string, (s: AbsencePauseNotifyService) => Promise<unknown>]>([
    [
      'stage 2 (warnStudent)',
      (s) => s.warnStudent({ ...target, streak: 2 }, 1),
    ],
    [
      'stage 3 (announcePause)',
      (s) => s.announcePause({ ...target, streak: 3 }),
    ],
  ])('%s does not claim a relative day', async (_stage, send) => {
    const { service, sendMessage } = makeService();
    await send(service);

    const texts = sendMessage.mock.calls.map(([, text]) => text as string);
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).not.toMatch(/\b(bugun|kecha)/i);
    }
  });

  it("stage 3's staff push opens the student's profile page", async () => {
    const { service, push } = makeService();
    await service.announcePause({ ...target, streak: 3 });

    expect(push.sendToUser).toHaveBeenCalledWith(
      20001,
      expect.objectContaining({ url: '/students/profile/10001' }),
    );
  });
});

describe('AbsencePauseNotifyService — barred lessons: soft, no sums (ADR-0142)', () => {
  const STUDENT_CHAT = '123';
  const STAFF_CHAT = '777';
  const base: PauseTarget = {
    enrollmentId: 'e-10001',
    studentId: 10001,
    streak: 1,
    companyId: 1001,
    student: {
      id: 10001,
      firstName: 'Ali',
      lastName: 'Valiyev',
      telegramChatId: STUDENT_CHAT,
    },
    group: {
      id: 'g-1',
      name: '#001',
      branchId: 1,
      branchPhone: '905351099',
      teachers: [{ teacherId: 500 }],
    },
  };
  const LESSON_DAY = new Date('2026-10-23T00:00:00.000Z');
  const SAME_EVENING = new Date('2026-10-23T15:30:00.000Z');

  function make() {
    const sendMessage = jest.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 20001, telegramChatId: STAFF_CHAT }]),
      },
    };
    const service = new AbsencePauseNotifyService(
      prisma as never,
      { create: jest.fn().mockResolvedValue({ id: 1 }) } as never,
      { sendToUser: jest.fn() } as never,
      { sendToUser: jest.fn().mockResolvedValue(undefined) } as never,
      { getBot: () => ({ telegram: { sendMessage } }) } as never,
    );
    return { service, sendMessage };
  }

  const textsTo = (sendMessage: jest.Mock, chat: string) =>
    sendMessage.mock.calls
      .filter(([to]) => to === chat)
      .map(([, text]) => text as string);

  const live = { ...base, barred: { live: true } };

  it('stage 1 greets by name, names the reason and the group, and asks for no money', async () => {
    const { service, sendMessage } = make();
    await service.nudgeStudent(live, LESSON_DAY, SAME_EVENING);
    const [text] = textsTo(sendMessage, STUDENT_CHAT);
    expect(text).toContain('Salom, Ali!');
    expect(text).toContain("to'lov hali ko'rinmayapti");
    expect(text).toContain('#001');
    expect(text).toContain('+998 90 535 10 99');
    expect(text).not.toMatch(/so'm/);
    expect(text).not.toMatch(/\d{4,}/);
    expect(text).not.toMatch(/qo'yilmadingiz/);
  });

  it('stage 1 names the date when sent after the lesson day', async () => {
    const { service, sendMessage } = make();
    await service.nudgeStudent(
      live,
      LESSON_DAY,
      new Date('2026-10-24T02:30:00.000Z'),
    );
    const [text] = textsTo(sendMessage, STUDENT_CHAT);
    expect(text).toContain('23.10.2026');
    expect(text).not.toMatch(/\bbugun/i);
  });

  it('stage 2 says the seat is kept and how many lessons are left', async () => {
    const { service, sendMessage } = make();
    await service.warnStudent({ ...live, streak: 2 }, 1);
    const [text] = textsTo(sendMessage, STUDENT_CHAT);
    expect(text).toContain('Ketma-ket 2 ta darsda');
    expect(text).toContain('Yana bir dars');
    expect(text).not.toMatch(/so'm/);
    // staff are told too
    expect(textsTo(sendMessage, STAFF_CHAT)).toHaveLength(1);
  });

  it('stage 3 tells the seat is paused, the attended lesson stays, no amounts', async () => {
    const { service, sendMessage } = make();
    await service.announcePause({ ...live, streak: 3 });
    const [text] = textsTo(sendMessage, STUDENT_CHAT);
    expect(text).toContain('vaqtincha to');
    expect(text).toContain('Kelgan darsingiz hisobingizda qoladi');
    expect(text).not.toMatch(/so'm/);
    expect(textsTo(sendMessage, STAFF_CHAT)).toHaveLength(1);
  });

  it('a test run (live: false) sends nothing to the student, and no stage 1/2 staff copy', async () => {
    const { service, sendMessage } = make();
    const dry = { ...base, barred: { live: false } };
    expect(await service.nudgeStudent(dry, LESSON_DAY, SAME_EVENING)).toBe(
      false,
    );
    expect(await service.warnStudent({ ...dry, streak: 2 }, 1)).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('a test run still tells staff about a real pause, and not the student', async () => {
    const { service, sendMessage } = make();
    await service.announcePause({
      ...base,
      streak: 3,
      barred: { live: false },
    });
    expect(textsTo(sendMessage, STUDENT_CHAT)).toHaveLength(0);
    expect(textsTo(sendMessage, STAFF_CHAT)).toHaveLength(1);
  });
});
