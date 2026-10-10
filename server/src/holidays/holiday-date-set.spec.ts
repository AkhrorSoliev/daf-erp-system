import { termHolidays } from './holiday-date-set';

describe('termHolidays', () => {
  it("reads the branch's and the company-wide holidays from the term's first day, 120 days on", async () => {
    const db = {
      holiday: {
        findMany: jest.fn().mockResolvedValue([
          {
            date: new Date('2026-10-01T00:00:00Z'),
            endDate: new Date('2026-10-02T00:00:00Z'),
          },
        ]),
      },
    };

    const set = await termHolidays(db as never, '2026-09-28', 1);

    expect([...set]).toEqual(['2026-10-01', '2026-10-02']);
    const where = db.holiday.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([{ branchId: null }, { branchId: 1 }]);
    expect(where.endDate.gte.getTime()).toBeLessThanOrEqual(
      new Date('2026-09-27T19:00:00Z').getTime(),
    );
    // 28.09.2026 + 120 days = 26.01.2027 (00:00 Tashkent = 25.01 19:00 UTC).
    expect(where.date.lte.getTime()).toBeGreaterThanOrEqual(
      new Date('2027-01-25T19:00:00Z').getTime(),
    );
  });
});
