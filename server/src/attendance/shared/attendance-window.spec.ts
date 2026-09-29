import {
  ENDED_REFUSAL,
  lessonHasEnded,
  newAttendanceWindow,
  secondsUntil,
  tashkentClock,
  windowRefusal,
} from './attendance-window';

const lesson = {
  date: '2026-10-01',
  todayStr: '2026-10-01',
  startTime: '17:30',
  endTime: '19:00',
};
const at = (h: number, m: number) => h * 60 + m;

describe('newAttendanceWindow', () => {
  it('opens ten minutes before the start', () => {
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(17, 19) })).toBe(
      'BEFORE',
    );
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(17, 20) })).toBe(
      'OPEN',
    );
  });

  it('closes at the end minute itself', () => {
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(18, 59) })).toBe(
      'OPEN',
    );
    expect(newAttendanceWindow({ ...lesson, nowMinutes: at(19, 0) })).toBe(
      'ENDED',
    );
  });

  it('is closed on every other day', () => {
    expect(
      newAttendanceWindow({
        ...lesson,
        date: '2026-09-30',
        nowMinutes: at(12, 0),
      }),
    ).toBe('NOT_TODAY');
    expect(
      newAttendanceWindow({
        ...lesson,
        date: '2026-10-02',
        nowMinutes: at(12, 0),
      }),
    ).toBe('NOT_TODAY');
  });

  it('uses the end of the working day for a group without times', () => {
    const noTimes = { ...lesson, startTime: null, endTime: null };
    expect(newAttendanceWindow({ ...noTimes, nowMinutes: at(7, 0) })).toBe(
      'OPEN',
    );
    expect(newAttendanceWindow({ ...noTimes, nowMinutes: at(23, 0) })).toBe(
      'ENDED',
    );
  });
});

describe('lessonHasEnded', () => {
  it('is true for any earlier day and false for any later one', () => {
    expect(
      lessonHasEnded({ ...lesson, date: '2026-09-30', nowMinutes: 0 }),
    ).toBe(true);
    expect(
      lessonHasEnded({ ...lesson, date: '2026-10-02', nowMinutes: at(23, 59) }),
    ).toBe(false);
  });

  it('is true today from the end minute on', () => {
    expect(lessonHasEnded({ ...lesson, nowMinutes: at(18, 59) })).toBe(false);
    expect(lessonHasEnded({ ...lesson, nowMinutes: at(19, 0) })).toBe(true);
  });
});

describe('tashkentClock', () => {
  it('reads the Tashkent day and minute of an instant', () => {
    expect(tashkentClock(new Date('2026-09-30T19:30:00.000Z'))).toEqual({
      todayStr: '2026-10-01',
      nowMinutes: 30,
    });
  });
});

describe('secondsUntil', () => {
  it('counts to the end time on the Tashkent clock, seconds included', () => {
    // 05:30:15Z = 10:30:15 Tashkent
    const now = new Date('2026-04-03T05:30:15.000Z');
    expect(secondsUntil('11:00', now)).toBe(1785);
    expect(secondsUntil('10:30', now)).toBe(-15);
  });
});

describe('windowRefusal', () => {
  const args = {
    date: '2026-10-01',
    todayStr: '2026-10-01',
    startTime: '17:30',
  };

  it('says nothing while open', () => {
    expect(windowRefusal('OPEN', args)).toBeNull();
  });

  it('names the opening time before the lesson', () => {
    expect(windowRefusal('BEFORE', args)).toBe(
      'Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (17:30)',
    );
  });

  it("sends a past lesson to the «Dars bo'ldimi?» question", () => {
    expect(windowRefusal('ENDED', args)).toBe(ENDED_REFUSAL);
    expect(windowRefusal('NOT_TODAY', { ...args, date: '2026-09-30' })).toBe(
      ENDED_REFUSAL,
    );
  });

  it('sends a future lesson to pre-marking', () => {
    expect(windowRefusal('NOT_TODAY', { ...args, date: '2026-10-02' })).toBe(
      'Davomat faqat dars kuni olinadi. Kelmaydiganlarni «Oldindan belgilash» bilan belgilang',
    );
  });
});
