import { lessonDatesInMonth } from './planned-lessons';

// Prod'dagi ikkita haqiqiy jadval shakli.
const MON_WED_FRI = ['friday', 'monday', 'wednesday'];
const TUE_THU_SAT = ['saturday', 'thursday', 'tuesday'];
const FIVE_DAYS = ['friday', 'monday', 'thursday', 'tuesday', 'wednesday'];

describe('lessonDatesInMonth', () => {
  it('sentabr 2026 da haftada 3 kunlik guruhga 13 dars beradi', () => {
    // Prod o'lchovi: 45 guruhda aynan shu raqam chiqqan.
    expect(
      lessonDatesInMonth({ year: 2026, month: 9, exactDays: TUE_THU_SAT }),
    ).toHaveLength(13);
    expect(
      lessonDatesInMonth({ year: 2026, month: 9, exactDays: MON_WED_FRI }),
    ).toHaveLength(13);
  });

  it('sentabr 2026 da haftada 5 kunlik Intensive guruhga 22 dars beradi', () => {
    expect(
      lessonDatesInMonth({ year: 2026, month: 9, exactDays: FIVE_DAYS }),
    ).toHaveLength(22);
  });

  it('sanalarni o`sish tartibida, YYYY-MM-DD ko`rinishida qaytaradi', () => {
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
    });
    expect(dates[0]).toBe('2026-09-01'); // seshanba
    expect(dates[1]).toBe('2026-09-03'); // payshanba
    expect(dates[2]).toBe('2026-09-05'); // shanba
    expect([...dates].sort()).toEqual(dates);
  });

  it('bayram va bekor qilingan kunlarni chiqarib tashlaydi', () => {
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      excludedDates: ['2026-09-01', '2026-09-03'],
    });
    expect(dates).toHaveLength(11);
    expect(dates).not.toContain('2026-09-01');
    expect(dates).not.toContain('2026-09-03');
  });

  it('fromDate berilsa o`sha kundan boshlab sanaydi (o`rtada qo`shilgan)', () => {
    // 17.09.2026 — payshanba. Shu kundan oy oxirigacha: 17, 19, 22, 24, 26, 29.
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      fromDate: '2026-09-17',
    });
    expect(dates[0]).toBe('2026-09-17');
    expect(dates).toHaveLength(6);
  });

  it('toDate berilsa o`sha kungacha sanaydi (o`rtada ketgan)', () => {
    const dates = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      toDate: '2026-09-10',
    });
    expect(dates[dates.length - 1]).toBe('2026-09-10');
    expect(dates).toHaveLength(5);
  });

  it('fromDate oydan keyin bo`lsa bo`sh ro`yxat qaytaradi', () => {
    expect(
      lessonDatesInMonth({
        year: 2026,
        month: 9,
        exactDays: TUE_THU_SAT,
        fromDate: '2026-10-05',
      }),
    ).toEqual([]);
  });

  it('exactDays bo`sh bo`lsa bo`sh ro`yxat qaytaradi', () => {
    expect(lessonDatesInMonth({ year: 2026, month: 9, exactDays: [] })).toEqual(
      [],
    );
  });

  it('kun nomlarini registr va bo`shliqqa qaramay tanidi', () => {
    expect(
      lessonDatesInMonth({
        year: 2026,
        month: 9,
        exactDays: [' Monday ', 'WEDNESDAY', 'friday'],
      }),
    ).toHaveLength(13);
  });

  it('ko`chirib kelingan kun oyga QO`SHILADI', () => {
    // Juma — jadvalda yo'q kun; ko'chirilgan dars o'sha kunga tushgan.
    const days = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      excludedDates: ['2026-09-01'],
      addedDates: ['2026-09-04'],
    });
    expect(days).toHaveLength(13);
    expect(days).toContain('2026-09-04');
    expect(days).not.toContain('2026-09-01');
    expect(days).toEqual([...days].sort());
  });

  it('ko`chirib kelingan kun ALLAQACHON jadvalda bo`lsa ikkinchi dars qo`shmaydi', () => {
    // 5-sentabr — shanba, guruhning o'z dars kuni.
    const days = lessonDatesInMonth({
      year: 2026,
      month: 9,
      exactDays: TUE_THU_SAT,
      excludedDates: ['2026-09-01'],
      addedDates: ['2026-09-05'],
    });
    expect(days).toHaveLength(12);
    expect(days.filter((d) => d === '2026-09-05')).toHaveLength(1);
  });

  it('boshqa oyning kuni qo`shilmaydi', () => {
    expect(
      lessonDatesInMonth({
        year: 2026,
        month: 9,
        exactDays: TUE_THU_SAT,
        addedDates: ['2026-10-01'],
      }),
    ).toHaveLength(13);
  });

  it('ko`chirib kelingan kun fromDate/toDate chegarasiga bo`ysunadi', () => {
    expect(
      lessonDatesInMonth({
        year: 2026,
        month: 9,
        exactDays: TUE_THU_SAT,
        addedDates: ['2026-09-04'],
        fromDate: '2026-09-10',
      }),
    ).not.toContain('2026-09-04');
    expect(
      lessonDatesInMonth({
        year: 2026,
        month: 9,
        exactDays: TUE_THU_SAT,
        addedDates: ['2026-09-30'],
        toDate: '2026-09-26',
      }),
    ).not.toContain('2026-09-30');
  });

  it('fevral kabi qisqa oyni to`g`ri sanaydi', () => {
    // 2028 — kabisa yili, fevral 29 kun. Du/Cho/Ju: 02-dan 28-gacha 12 ta.
    expect(
      lessonDatesInMonth({ year: 2028, month: 2, exactDays: MON_WED_FRI }),
    ).toHaveLength(12);
  });
});
