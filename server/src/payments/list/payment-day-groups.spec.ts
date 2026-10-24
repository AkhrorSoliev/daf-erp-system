import {
  activeOnDay,
  DayEnrollment,
  groupIdsOnDay,
} from './payment-day-groups';

const t = (iso: string) => new Date(iso);
const enr = (over: Partial<DayEnrollment>): DayEnrollment => ({
  id: 'e1',
  groupId: 'g1',
  status: 'ACTIVE',
  createdAt: t('2026-09-01T05:00:00Z'),
  startDate: null,
  statusChangedAt: null,
  groupDeletedAt: null,
  log: [{ status: 'ACTIVE', transitionAt: t('2026-09-01T05:00:00Z') }],
  ...over,
});

describe('activeOnDay', () => {
  it('joined later the same day still counts (paid first, enrolled after)', () => {
    const e = enr({
      createdAt: t('2026-10-10T10:00:00Z'),
      log: [{ status: 'ACTIVE', transitionAt: t('2026-10-10T10:00:00Z') }],
    });
    expect(activeOnDay(e, '2026-10-10')).toBe(true);
    expect(activeOnDay(e, '2026-10-09')).toBe(false);
  });
  it('left that day counts that day, not the next', () => {
    const e = enr({
      status: 'DROPPED',
      statusChangedAt: t('2026-10-10T08:00:00Z'),
      log: [
        { status: 'ACTIVE', transitionAt: t('2026-09-01T05:00:00Z') },
        { status: 'DROPPED', transitionAt: t('2026-10-10T08:00:00Z') },
      ],
    });
    expect(activeOnDay(e, '2026-10-10')).toBe(true);
    expect(activeOnDay(e, '2026-10-11')).toBe(false);
  });
  it('a freeze in between is no group', () => {
    const e = enr({
      log: [
        { status: 'ACTIVE', transitionAt: t('2026-09-01T05:00:00Z') },
        { status: 'FROZEN', transitionAt: t('2026-10-01T05:00:00Z') },
        { status: 'ACTIVE', transitionAt: t('2026-10-20T05:00:00Z') },
      ],
    });
    expect(activeOnDay(e, '2026-10-10')).toBe(false);
    expect(activeOnDay(e, '2026-10-20')).toBe(true);
  });
  it('an empty log reads the row: active from creation, closed at statusChangedAt', () => {
    const e = enr({
      log: [],
      status: 'DROPPED',
      statusChangedAt: t('2026-10-05T06:00:00Z'),
    });
    expect(activeOnDay(e, '2026-10-04')).toBe(true);
    expect(activeOnDay(e, '2026-10-06')).toBe(false);
  });
  it('fills a missing opening row (supplyOpeningRow)', () => {
    const e = enr({
      status: 'FROZEN',
      log: [{ status: 'FROZEN', transitionAt: t('2026-10-01T05:00:00Z') }],
    });
    expect(activeOnDay(e, '2026-09-20')).toBe(true);
  });
  it('fills a missing closing row (supplyClosingRow)', () => {
    const e = enr({
      status: 'DROPPED',
      statusChangedAt: t('2026-10-05T06:00:00Z'),
    });
    expect(activeOnDay(e, '2026-10-10')).toBe(false);
  });
  it('a deleted group closes the enrollment at deletedAt', () => {
    const e = enr({ groupDeletedAt: t('2026-10-05T06:00:00Z') });
    expect(activeOnDay(e, '2026-10-04')).toBe(true);
    expect(activeOnDay(e, '2026-10-05')).toBe(true);
    expect(activeOnDay(e, '2026-10-06')).toBe(false);
  });
  it('a start date after the day is no group', () => {
    expect(
      activeOnDay(enr({ startDate: t('2026-10-15T00:00:00Z') }), '2026-10-10'),
    ).toBe(false);
  });
});

describe('groupIdsOnDay', () => {
  it('a transfer day gives both groups', () => {
    const old = enr({
      id: 'a',
      groupId: 'g1',
      status: 'TRANSFERRED',
      statusChangedAt: t('2026-10-10T07:00:00Z'),
      log: [
        { status: 'ACTIVE', transitionAt: t('2026-09-01T05:00:00Z') },
        { status: 'TRANSFERRED', transitionAt: t('2026-10-10T07:00:00Z') },
      ],
    });
    const neu = enr({
      id: 'b',
      groupId: 'g2',
      createdAt: t('2026-10-10T07:00:00Z'),
      log: [{ status: 'ACTIVE', transitionAt: t('2026-10-10T07:00:00Z') }],
    });
    expect(groupIdsOnDay([old, neu], t('2026-10-10T09:00:00Z')).sort()).toEqual(
      ['g1', 'g2'],
    );
  });
});
