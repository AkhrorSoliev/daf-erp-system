import { BadRequestException } from '@nestjs/common';
import {
  startDayFor,
  todayLessonQuestion,
  type TodayLessonInput,
} from './enroll-start-day';

// 28.10.2026 is a Wednesday; the group meets Wed + Fri, 18:00–19:30.
const TODAY = '2026-10-28';
const group = {
  id: 'g1',
  name: 'A1',
  companyId: 1,
  branchId: 1,
  exactDays: ['wednesday', 'friday'],
  lessonStartTime: '18:00',
  lessonEndTime: '19:30',
  startDate: null,
  endDate: null,
};
const at = (hhmm: string) =>
  Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

function input(over: Partial<TodayLessonInput> = {}): TodayLessonInput {
  return {
    todayStr: TODAY,
    nowMinutes: at('20:00'),
    startDay: TODAY,
    group,
    reschedules: [],
    cancelledDays: new Set(),
    holidays: new Set(),
    ...over,
  };
}

describe('todayLessonQuestion', () => {
  it("asks once today's lesson is over and names the next lesson day", () => {
    expect(todayLessonQuestion(input())).toEqual({
      needed: true,
      startTime: '18:00',
      endTime: '19:30',
      nextLessonDate: '2026-10-30',
    });
  });

  it('does not ask while the lesson is still running or has not begun', () => {
    expect(todayLessonQuestion(input({ nowMinutes: at('19:29') })).needed).toBe(
      false,
    );
    expect(todayLessonQuestion(input({ nowMinutes: at('10:00') })).needed).toBe(
      false,
    );
  });

  it('does not ask when the start day is not today', () => {
    expect(todayLessonQuestion(input({ startDay: '2026-10-30' })).needed).toBe(
      false,
    );
  });

  it('does not ask on a day without a lesson, a cancelled one or a holiday', () => {
    expect(
      todayLessonQuestion(
        input({ todayStr: '2026-10-29', startDay: '2026-10-29' }),
      ).needed,
    ).toBe(false);
    expect(
      todayLessonQuestion(input({ cancelledDays: new Set([TODAY]) })).needed,
    ).toBe(false);
    expect(
      todayLessonQuestion(input({ holidays: new Set([TODAY]) })).needed,
    ).toBe(false);
  });

  it('skips a cancelled or holiday day when looking for the next lesson', () => {
    const q = todayLessonQuestion(
      input({
        cancelledDays: new Set(['2026-10-30']),
        holidays: new Set(['2026-11-02']),
      }),
    );
    // Fri 30.10 cancelled, Mon 02.11 not a lesson day anyway -> Wed 04.11.
    expect(q).toMatchObject({ needed: true, nextLessonDate: '2026-11-04' });
  });

  it('returns null when the group has no lesson ahead', () => {
    const q = todayLessonQuestion(
      input({
        group: { ...group, endDate: new Date('2026-10-28T00:00:00.000Z') },
      }),
    );
    expect(q).toMatchObject({ needed: true, nextLessonDate: null });
  });

  it("uses a move's own times and counts the make-up day as a lesson day", () => {
    const q = todayLessonQuestion(
      input({
        nowMinutes: at('14:30'),
        reschedules: [
          {
            groupId: 'g1',
            originalDate: new Date('2026-10-28T00:00:00.000Z'),
            newDate: new Date('2026-10-29T00:00:00.000Z'),
            newLessonStartTime: '10:00',
            newLessonEndTime: '11:30',
          },
        ],
      }),
    );
    // Wed 28 moved to Thu 29: nothing today, so no question.
    expect(q.needed).toBe(false);
  });
});

describe('startDayFor', () => {
  const asked = todayLessonQuestion(input());

  it('is the picked day, or today, when nothing is asked', () => {
    const none = { needed: false } as const;
    expect(startDayFor(none, null, TODAY, undefined)).toBe(TODAY);
    expect(startDayFor(none, '2026-11-02', TODAY, true)).toBe('2026-11-02');
  });

  it('refuses a missing answer instead of defaulting', () => {
    expect(() => startDayFor(asked, null, TODAY, undefined)).toThrow(
      BadRequestException,
    );
  });

  it('"yes" keeps today, "no" moves to the next lesson day', () => {
    expect(startDayFor(asked, null, TODAY, true)).toBe(TODAY);
    expect(startDayFor(asked, null, TODAY, false)).toBe('2026-10-30');
  });

  it('refuses "no" when there is no next lesson', () => {
    const last = { ...asked, nextLessonDate: null } as typeof asked;
    expect(() => startDayFor(last, null, TODAY, false)).toThrow(
      BadRequestException,
    );
  });
});
