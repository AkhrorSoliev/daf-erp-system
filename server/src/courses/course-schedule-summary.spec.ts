import { courseScheduleSummary } from './course-schedule-summary';

const MWF = ['monday', 'wednesday', 'friday'];
const TT = ['tuesday', 'thursday'];

describe('courseScheduleSummary', () => {
  it('reads lessons a week from the groups, and the month range from the calendar', () => {
    // Sep 2026 → Aug 2027: a Mon/Wed/Fri group has 12 to 14 lessons a month.
    const s = courseScheduleSummary([MWF, MWF], 2026, 9);
    expect(s.weeklyLessons).toEqual([3]);
    expect(s.monthLessons).toEqual({ min: 12, max: 14 });
  });

  it('lists every distinct week when groups differ', () => {
    const s = courseScheduleSummary([MWF, TT], 2026, 9);
    expect(s.weeklyLessons).toEqual([2, 3]);
    expect(s.monthLessons!.min).toBeLessThanOrEqual(9);
    expect(s.monthLessons!.max).toBe(14);
  });

  it('says nothing when no group has a schedule', () => {
    expect(courseScheduleSummary([], 2026, 9)).toEqual({
      weeklyLessons: [],
      monthLessons: null,
    });
    expect(courseScheduleSummary([[]], 2026, 9).monthLessons).toBeNull();
  });

  it('ignores case and spaces in stored day names', () => {
    const s = courseScheduleSummary([[' Monday', 'WEDNESDAY ']], 2026, 9);
    expect(s.weeklyLessons).toEqual([2]);
  });
});
