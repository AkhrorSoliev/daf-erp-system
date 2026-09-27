import {
  lateArrival,
  lessonWindowState,
  minutesLate,
  windowRefusal,
} from './lesson-window';

// Tashkent is UTC+5: 15:00 Tashkent = 10:00Z.
const lesson = {
  lessonDay: '2026-10-05',
  startTime: '15:00',
  endTime: '16:30',
};
const at = (iso: string) => new Date(iso);

describe('lessonWindowState', () => {
  it('is before until 10 minutes ahead of the start', () => {
    expect(
      lessonWindowState({ ...lesson, now: at('2026-10-05T09:49:00Z') }),
    ).toBe('before');
  });

  it('opens 10 minutes before the start', () => {
    expect(
      lessonWindowState({ ...lesson, now: at('2026-10-05T09:50:00Z') }),
    ).toBe('open');
  });

  it('is still open during the last minute of the lesson', () => {
    expect(
      lessonWindowState({ ...lesson, now: at('2026-10-05T11:30:59Z') }),
    ).toBe('open');
  });

  it('closes after the end minute', () => {
    expect(
      lessonWindowState({ ...lesson, now: at('2026-10-05T11:31:00Z') }),
    ).toBe('closed');
  });

  it('is closed on any later day', () => {
    expect(
      lessonWindowState({ ...lesson, now: at('2026-10-06T04:00:00Z') }),
    ).toBe('closed');
  });

  it('is before on any earlier day', () => {
    expect(
      lessonWindowState({ ...lesson, now: at('2026-10-04T12:00:00Z') }),
    ).toBe('before');
  });

  it('uses the Tashkent day, not the UTC day', () => {
    // 2026-10-05T19:30Z is 06.10 00:30 in Tashkent: the 05.10 lesson is over.
    expect(
      lessonWindowState({ ...lesson, now: at('2026-10-05T19:30:00Z') }),
    ).toBe('closed');
  });

  it('is open all lesson day for a group without times', () => {
    const noTimes = { lessonDay: '2026-10-05', startTime: null, endTime: null };
    expect(
      lessonWindowState({ ...noTimes, now: at('2026-10-05T01:00:00Z') }),
    ).toBe('open');
  });
});

describe('windowRefusal', () => {
  it('names the date and the end time of a closed lesson', () => {
    expect(windowRefusal('closed', lesson, at('2026-10-06T04:00:00Z'))).toBe(
      "Dars tugagan (05.10.2026, 16:30). Davomat yopilgan — endi uni saytda kiritib bo'lmaydi",
    );
  });

  it('names the start on the lesson day', () => {
    expect(windowRefusal('before', lesson, at('2026-10-05T08:00:00Z'))).toBe(
      'Davomat dars boshlanishidan 10 daqiqa oldin ochiladi (15:00)',
    );
  });

  it('says a future lesson has not started', () => {
    expect(windowRefusal('before', lesson, at('2026-10-03T08:00:00Z'))).toBe(
      'Bu dars hali boshlanmagan (05.10.2026). Davomat dars kuni ochiladi',
    );
  });
});

describe('minutesLate (ADR-0046)', () => {
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

describe('lateArrival (ADR-0046)', () => {
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
