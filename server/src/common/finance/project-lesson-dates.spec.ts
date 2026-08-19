import { projectLessonDates } from './project-lesson-dates';

// #050 guruhi: dushanba / chorshanba / juma (JS: 1, 3, 5).
const MON_WED_FRI = () => [1, 3, 5];

describe('projectLessonDates', () => {
  it('projects the remaining prepaid lessons onto the group schedule', () => {
    // #10601: 19.08.2026 (chorshanba) gacha 3 ta dars o'tilgan, 7 tasi qolgan.
    const dates = projectLessonDates({
      afterDateStr: '2026-08-19',
      count: 7,
      resolveScheduleDays: MON_WED_FRI,
      skipDates: new Set(),
    });

    expect(dates).toEqual([
      '2026-08-21',
      '2026-08-24',
      '2026-08-26',
      '2026-08-28',
      '2026-08-31',
      '2026-09-02',
      '2026-09-04',
    ]);
  });

  it('skips holidays and cancelled lessons', () => {
    const dates = projectLessonDates({
      afterDateStr: '2026-08-19',
      count: 3,
      resolveScheduleDays: MON_WED_FRI,
      skipDates: new Set(['2026-08-21', '2026-08-24']),
    });

    expect(dates).toEqual(['2026-08-26', '2026-08-28', '2026-08-31']);
  });

  it('stops at the group endDate instead of inventing lessons past it', () => {
    // Ro'yxat `count` dan QISQA qaytadi — chaqiruvchi "oxirini aytolmaymiz"
    // deb o'qishi kerak, uzunlikni to'ldirib emas.
    const dates = projectLessonDates({
      afterDateStr: '2026-08-19',
      count: 7,
      resolveScheduleDays: MON_WED_FRI,
      skipDates: new Set(),
      lastPossibleDateStr: '2026-08-26',
    });

    expect(dates).toEqual(['2026-08-21', '2026-08-24', '2026-08-26']);
  });

  it('returns nothing when the schedule is unknown for that period', () => {
    const dates = projectLessonDates({
      afterDateStr: '2026-08-19',
      count: 5,
      resolveScheduleDays: () => null,
      skipDates: new Set(),
    });

    expect(dates).toEqual([]);
  });

  it('returns nothing when there is nothing left to project', () => {
    expect(
      projectLessonDates({
        afterDateStr: '2026-08-19',
        count: 0,
        resolveScheduleDays: MON_WED_FRI,
        skipDates: new Set(),
      }),
    ).toEqual([]);
  });
});
