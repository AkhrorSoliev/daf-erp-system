import { endedLessonsOn, type SweepGroup } from './ended-lessons';

const group = (over: Partial<SweepGroup> = {}): SweepGroup => ({
  id: 'g1',
  name: '#014',
  companyId: 1,
  branchId: 2,
  exactDays: ['monday', 'wednesday', 'friday'],
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
  startDate: null,
  endDate: null,
  ...over,
});
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
// 2026-09-30 is a Wednesday.
const base = {
  todayStr: '2026-09-30',
  nowMinutes: 18 * 60,
  reschedules: [],
  cancelledGroupIds: new Set<string>(),
  isHoliday: () => false,
};

describe('endedLessonsOn', () => {
  it('returns a scheduled lesson once it has ended', () => {
    expect(endedLessonsOn({ ...base, groups: [group()] })).toEqual([
      {
        groupId: 'g1',
        groupName: '#014',
        companyId: 1,
        branchId: 2,
        startTime: '16:00',
        endTime: '17:30',
      },
    ]);
  });

  it('waits for the end minute', () => {
    expect(
      endedLessonsOn({ ...base, nowMinutes: 17 * 60 + 29, groups: [group()] }),
    ).toEqual([]);
    expect(
      endedLessonsOn({ ...base, nowMinutes: 17 * 60 + 30, groups: [group()] }),
    ).toHaveLength(1);
  });

  it('skips a weekday the group does not meet', () => {
    expect(
      endedLessonsOn({ ...base, groups: [group({ exactDays: ['tuesday'] })] }),
    ).toEqual([]);
  });

  it('skips a cancelled lesson and a branch holiday', () => {
    expect(
      endedLessonsOn({
        ...base,
        groups: [group()],
        cancelledGroupIds: new Set(['g1']),
      }),
    ).toEqual([]);
    expect(
      endedLessonsOn({ ...base, groups: [group()], isHoliday: (b) => b === 2 }),
    ).toEqual([]);
  });

  it('skips a lesson moved away and times a lesson moved here by the move', () => {
    const away = {
      groupId: 'g1',
      originalDate: day('2026-09-30'),
      newDate: day('2026-10-02'),
      newLessonStartTime: null,
      newLessonEndTime: null,
    };
    expect(
      endedLessonsOn({ ...base, groups: [group()], reschedules: [away] }),
    ).toEqual([]);

    const here = {
      groupId: 'g1',
      originalDate: day('2026-09-29'),
      newDate: day('2026-09-30'),
      newLessonStartTime: '10:00',
      newLessonEndTime: '11:30',
    };
    expect(
      endedLessonsOn({
        ...base,
        nowMinutes: 12 * 60,
        groups: [group({ exactDays: ['tuesday'] })],
        reschedules: [here],
      }),
    ).toEqual([
      expect.objectContaining({ startTime: '10:00', endTime: '11:30' }),
    ]);
  });

  it('respects the group date range (stored as Tashkent midnight)', () => {
    // 2026-10-01 00:00 Tashkent = 2026-09-30T19:00Z
    expect(
      endedLessonsOn({
        ...base,
        groups: [group({ startDate: new Date('2026-09-30T19:00:00.000Z') })],
      }),
    ).toEqual([]);
    expect(
      endedLessonsOn({
        ...base,
        groups: [group({ endDate: new Date('2026-09-28T19:00:00.000Z') })],
      }),
    ).toEqual([]);
  });

  it('closes a group without times at the end of the working day', () => {
    const noTimes = group({ lessonStartTime: null, lessonEndTime: null });
    expect(
      endedLessonsOn({ ...base, nowMinutes: 22 * 60, groups: [noTimes] }),
    ).toEqual([]);
    expect(
      endedLessonsOn({ ...base, nowMinutes: 23 * 60, groups: [noTimes] }),
    ).toEqual([
      expect.objectContaining({ startTime: '08:00', endTime: '23:00' }),
    ]);
  });
});
