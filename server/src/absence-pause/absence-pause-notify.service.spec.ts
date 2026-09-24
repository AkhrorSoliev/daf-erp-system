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
      { sendToUser: jest.fn().mockResolvedValue(undefined) } as never,
      { getBot: () => ({ telegram: { sendMessage } }) } as never,
    );
    return { service, sendMessage };
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
});
