import { splitMonthLessons, type ExpectationGroup } from './expectation-math';

// Avgust 2026 — 1-avgust shanbaga to'g'ri keladi.
//   dushanba   3,10,17,24,31
//   seshanba   4,11,18,25
//   chorshanba 5,12,19,26
//   payshanba  6,13,20,27
//   juma       7,14,21,28
// Du/Chor/Ju = 13 sana.
const MON_WED_FRI = ['monday', 'wednesday', 'friday'];

const group = (over: Partial<ExpectationGroup> = {}): ExpectationGroup => ({
  groupId: 'g1',
  exactDays: MON_WED_FRI,
  startDateStr: null,
  endDateStr: null,
  scheduleSnapshots: [],
  roster: [
    { studentId: 1, perLesson: 100_000 },
    { studentId: 2, perLesson: 100_000 },
  ],
  datesWithAttendance: new Set<string>(),
  cancelledDates: new Set<string>(),
  coveredAttendances: [],
  uncoveredAttendances: [],
  ...over,
});

// `todayStr` before the month starts = the whole month is still ahead, so
// every scheduled slot projects. Individual tests override it to sit inside
// the month and check that history is left alone.
const opts = (holidays: string[] = [], todayStr = '2026-07-31') => ({
  monthStartStr: '2026-08-01',
  monthEndStr: '2026-08-31',
  holidayDates: new Set(holidays),
  todayStr,
});

describe('splitMonthLessons', () => {
  it('counts every scheduled student-lesson in the month', () => {
    const r = splitMonthLessons([group()], opts());
    expect(r.remainingLessons).toBe(26); // 13 sana × 2 o'quvchi
    expect(r.remainingValue).toBe(2_600_000);
    expect(r.heldValue).toBe(0);
  });

  it('drops holidays', () => {
    const r = splitMonthLessons([group()], opts(['2026-08-03', '2026-08-05']));
    expect(r.remainingLessons).toBe(22); // 11 sana × 2
  });

  it('drops cancelled lessons', () => {
    const r = splitMonthLessons(
      [group({ cancelledDates: new Set(['2026-08-07']) })],
      opts(),
    );
    expect(r.remainingLessons).toBe(24);
  });

  it('drops dates outside the group lifecycle', () => {
    const r = splitMonthLessons(
      [group({ startDateStr: '2026-08-17', endDateStr: '2026-08-21' })],
      opts(),
    );
    expect(r.remainingLessons).toBe(6); // 17,19,21 × 2
  });

  it('honours a past schedule change instead of projecting today backwards', () => {
    // Guruh 15-avgustda Du/Chor/Ju dan Se/Pay ga o'tgan.
    //   1–14  Du/Chor/Ju → 3,5,7,10,12,14 = 6
    //   15–31 Se/Pay     → 18,20,25,27    = 4
    const r = splitMonthLessons(
      [
        group({
          exactDays: ['tuesday', 'thursday'],
          scheduleSnapshots: [
            {
              exactDays: MON_WED_FRI,
              validFrom: new Date('2026-07-01T00:00:00Z'),
              validTo: new Date('2026-08-15T00:00:00Z'),
            },
            {
              exactDays: ['tuesday', 'thursday'],
              validFrom: new Date('2026-08-15T00:00:00Z'),
              validTo: null,
            },
          ],
        }),
      ],
      opts(),
    );
    expect(r.remainingLessons).toBe((6 + 4) * 2);
  });

  it('puts a taught-but-unpaid lesson on the remaining side', () => {
    const r = splitMonthLessons(
      [
        group({
          datesWithAttendance: new Set(['2026-08-03']),
          uncoveredAttendances: [{ perLesson: 100_000 }, { perLesson: 100_000 }],
        }),
      ],
      opts(),
    );
    // 03.08 rosterdan chiqdi (12 sana × 2 = 24), o'rniga 2 ta qoplanmagan dars.
    expect(r.remainingLessons).toBe(26);
    expect(r.remainingValue).toBe(2_600_000);
    expect(r.heldValue).toBe(0);
  });

  it('puts a covered lesson on the held side and never double-counts it', () => {
    const r = splitMonthLessons(
      [
        group({
          datesWithAttendance: new Set(['2026-08-03']),
          coveredAttendances: [{ perLesson: 90_000 }, { perLesson: 110_000 }],
        }),
      ],
      opts(),
    );
    expect(r.heldValue).toBe(200_000);
    expect(r.heldLessons).toBe(2);
    expect(r.remainingLessons).toBe(24); // 12 qolgan sana × 2
    expect(r.remainingLessons + r.heldLessons).toBe(26); // jami o'zgarmadi
  });

  it('does not project into an unknown pre-snapshot period', () => {
    // Snapshot faqat 20-avgustdan boshlanadi — undan oldingi jadval noma'lum,
    // shuning uchun u davr umuman proyeksiya qilinmaydi.
    // 20-dan keyingi Du/Chor/Ju: 21,24,26,28,31 = 5 sana.
    const r = splitMonthLessons(
      [
        group({
          scheduleSnapshots: [
            {
              exactDays: MON_WED_FRI,
              validFrom: new Date('2026-08-20T00:00:00Z'),
              validTo: null,
            },
          ],
        }),
      ],
      opts(),
    );
    expect(r.remainingLessons).toBe(10); // 5 sana × 2 o'quvchi
  });

  it('contributes nothing when the group has no active students', () => {
    const r = splitMonthLessons([group({ roster: [] })], opts());
    expect(r.remainingLessons).toBe(0);
    expect(r.remainingValue).toBe(0);
  });

  it('never projects onto a past date that has no attendance', () => {
    // Bugun 15-avgust. 3,5,7,10,12,14 o'tib ketgan va davomatsiz — dars
    // bo'lganiga dalil yo'q, shuning uchun sanalmaydi.
    // Qolgani: 17,19,21,24,26,28,31 = 7 sana.
    const r = splitMonthLessons([group()], opts([], '2026-08-15'));
    expect(r.remainingLessons).toBe(14); // 7 sana × 2 o'quvchi
  });

  it('still projects TODAY — its lesson may yet be taught and marked', () => {
    // Bugun 17-avgust, dushanba — dars kuni. Davomat hali olinmagan bo'lishi
    // mumkin (soat 10:00), shuning uchun u hisobda qoladi.
    const r = splitMonthLessons([group()], opts([], '2026-08-17'));
    expect(r.remainingLessons).toBe(14); // 17,19,21,24,26,28,31 × 2
  });

  it('a CLOSED month projects nothing — expected collapses onto held', () => {
    // Butun oy o'tmishda: bitta ham kelajakdagi dars yo'q.
    const r = splitMonthLessons(
      [
        group({
          datesWithAttendance: new Set(['2026-08-03']),
          coveredAttendances: [{ perLesson: 100_000 }],
        }),
      ],
      opts([], '2026-09-01'),
    );
    expect(r.remainingLessons).toBe(0);
    expect(r.remainingValue).toBe(0);
    expect(r.heldValue).toBe(100_000);
  });
});
