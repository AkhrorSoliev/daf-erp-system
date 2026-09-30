import {
  ENDED_REFUSAL,
  effectiveLessonTimes,
  lateArrival,
  lessonHasEnded,
  minutesLate,
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

  it("opens by the company's lead when it is given", () => {
    const lead = { ...lesson, opensMinutesBefore: 20 };
    expect(newAttendanceWindow({ ...lead, nowMinutes: at(17, 5) })).toBe(
      'BEFORE',
    );
    expect(newAttendanceWindow({ ...lead, nowMinutes: at(17, 15) })).toBe(
      'OPEN',
    );
    expect(
      windowRefusal('BEFORE', {
        date: lesson.date,
        todayStr: lesson.todayStr,
        startTime: lesson.startTime,
        opensMinutesBefore: 20,
      }),
    ).toBe('Davomat dars boshlanishidan 20 daqiqa oldin ochiladi (17:30)');
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

describe('effectiveLessonTimes', () => {
  const group = { lessonStartTime: '09:00', lessonEndTime: '10:30' };

  it("uses the group's times for an ordinary day", () => {
    expect(effectiveLessonTimes(group, null)).toEqual({
      startTime: '09:00',
      endTime: '10:30',
    });
  });

  it("uses the move's own times on a day moved here", () => {
    expect(
      effectiveLessonTimes(group, {
        newLessonStartTime: '18:00',
        newLessonEndTime: '19:30',
      }),
    ).toEqual({ startTime: '18:00', endTime: '19:30' });
  });

  it("keeps the group's times for a move that carries none", () => {
    expect(
      effectiveLessonTimes(group, {
        newLessonStartTime: null,
        newLessonEndTime: null,
      }),
    ).toEqual({ startTime: '09:00', endTime: '10:30' });
  });

  it('passes a group without times through as null', () => {
    expect(
      effectiveLessonTimes(
        { lessonStartTime: null, lessonEndTime: null },
        null,
      ),
    ).toEqual({ startTime: null, endTime: null });
  });
});

describe('minutesLate (ADR-0048)', () => {
  const lesson = { lessonDay: '2026-10-05', startTime: '14:00' };
  it('counts whole minutes from the Tashkent start', () => {
    // 14:17:40 Tashkent = 09:17:40Z.
    expect(
      minutesLate({ ...lesson, now: new Date('2026-10-05T09:17:40Z') }),
    ).toBe(17);
  });
  it('is null at or before the start and without a start time', () => {
    expect(
      minutesLate({ ...lesson, now: new Date('2026-10-05T08:55:00Z') }),
    ).toBeNull();
    expect(
      minutesLate({ ...lesson, now: new Date('2026-10-05T09:00:30Z') }),
    ).toBeNull();
    expect(
      minutesLate({
        lessonDay: '2026-10-05',
        startTime: null,
        now: new Date('2026-10-05T10:00:00Z'),
      }),
    ).toBeNull();
  });
});

describe('lateArrival (ADR-0048)', () => {
  const base = {
    lessonAlreadyTaken: true,
    savedByTeacherOnly: false,
    oldStatus: 'ABSENT',
    oldLateMinutes: null,
    newStatus: 'PRESENT',
    minutesNow: 25,
  };
  it("turns an administrator's later PRESENT into LATE with the minutes", () => {
    expect(lateArrival(base)).toEqual({ status: 'LATE', lateMinutes: 25 });
    expect(lateArrival({ ...base, oldStatus: null })).toEqual({
      status: 'LATE',
      lateMinutes: 25,
    });
    expect(
      lateArrival({ ...base, oldStatus: 'EXCUSED', newStatus: 'LATE' }),
    ).toEqual({
      status: 'LATE',
      lateMinutes: 25,
    });
  });
  it('writes as sent on the first save, from a teacher, or before the start', () => {
    expect(lateArrival({ ...base, lessonAlreadyTaken: false })).toEqual({
      status: 'PRESENT',
      lateMinutes: null,
    });
    expect(lateArrival({ ...base, savedByTeacherOnly: true })).toEqual({
      status: 'PRESENT',
      lateMinutes: null,
    });
    expect(lateArrival({ ...base, minutesNow: null })).toEqual({
      status: 'PRESENT',
      lateMinutes: null,
    });
  });
  it('leaves a student already in the lesson alone', () => {
    expect(lateArrival({ ...base, oldStatus: 'PRESENT' })).toEqual({
      status: 'PRESENT',
      lateMinutes: null,
    });
  });
  it('keeps the minutes while LATE stays LATE and clears them otherwise', () => {
    expect(
      lateArrival({
        ...base,
        oldStatus: 'LATE',
        oldLateMinutes: 9,
        newStatus: 'LATE',
      }),
    ).toEqual({ status: 'LATE', lateMinutes: 9 });
    expect(
      lateArrival({
        ...base,
        oldStatus: 'LATE',
        oldLateMinutes: 9,
        newStatus: 'ABSENT',
      }),
    ).toEqual({ status: 'ABSENT', lateMinutes: null });
  });
});
