import {
  addWorkingHours,
  endOfNthWorkingDayAfter,
  ownershipDueAt,
} from './ownership-deadline';

// Tashkent wall clock to an instant. 2026-10-19 is a Monday.
const t = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+05:00`);
const none = () => false;
const holidays =
  (...days: string[]) =>
  (day: string) =>
    days.includes(day);

describe('addWorkingHours', () => {
  it('stays inside one working day', () => {
    expect(addWorkingHours(t('2026-10-19', '10:00'), 2, none)).toEqual(
      t('2026-10-19', '12:00'),
    );
  });

  it('carries the rest to the next morning', () => {
    expect(addWorkingHours(t('2026-10-19', '17:00'), 2, none)).toEqual(
      t('2026-10-20', '09:00'),
    );
  });

  it('can end exactly at 18:00', () => {
    expect(addWorkingHours(t('2026-10-19', '16:00'), 2, none)).toEqual(
      t('2026-10-19', '18:00'),
    );
  });

  it('starts at 08:00 when the lead is taken before the day opens', () => {
    expect(addWorkingHours(t('2026-10-19', '06:00'), 2, none)).toEqual(
      t('2026-10-19', '10:00'),
    );
  });

  it('starts the next working morning when taken after 18:00', () => {
    expect(addWorkingHours(t('2026-10-23', '19:00'), 2, none)).toEqual(
      t('2026-10-24', '10:00'),
    );
  });

  it('skips Sunday', () => {
    expect(addWorkingHours(t('2026-10-24', '17:30'), 2, none)).toEqual(
      t('2026-10-26', '09:30'),
    );
    expect(addWorkingHours(t('2026-10-25', '12:00'), 2, none)).toEqual(
      t('2026-10-26', '10:00'),
    );
  });

  it('skips a holiday', () => {
    expect(
      addWorkingHours(t('2026-10-19', '17:00'), 2, holidays('2026-10-20')),
    ).toEqual(t('2026-10-21', '09:00'));
  });
});

describe('endOfNthWorkingDayAfter', () => {
  it("ends at 18:00 of the n-th working day after the action's day", () => {
    expect(endOfNthWorkingDayAfter(t('2026-10-19', '15:00'), 3, none)).toEqual(
      t('2026-10-22', '18:00'),
    );
  });

  it('skips Sunday', () => {
    expect(endOfNthWorkingDayAfter(t('2026-10-22', '10:00'), 3, none)).toEqual(
      t('2026-10-26', '18:00'),
    );
    expect(endOfNthWorkingDayAfter(t('2026-10-24', '12:00'), 3, none)).toEqual(
      t('2026-10-28', '18:00'),
    );
  });

  it('skips a holiday', () => {
    expect(
      endOfNthWorkingDayAfter(
        t('2026-10-19', '15:00'),
        3,
        holidays('2026-10-21'),
      ),
    ).toEqual(t('2026-10-23', '18:00'));
  });
});

describe('ownershipDueAt', () => {
  const rules = { firstActionHours: 2, followUpDays: 3 };

  it('gives the first action two working hours from the claim', () => {
    expect(
      ownershipDueAt(
        { ownedAt: t('2026-10-19', '10:00'), ownerActedAt: null },
        rules,
        none,
      ),
    ).toEqual(t('2026-10-19', '12:00'));
  });

  it('gives the next action three working days from the last one', () => {
    expect(
      ownershipDueAt(
        {
          ownedAt: t('2026-10-19', '10:00'),
          ownerActedAt: t('2026-10-19', '11:00'),
        },
        rules,
        none,
      ),
    ).toEqual(t('2026-10-22', '18:00'));
  });
});
