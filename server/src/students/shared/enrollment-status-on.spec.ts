import { enrollmentStatusOn } from './enrollment-status-on';

const at = (s: string) => new Date(s);

describe('enrollmentStatusOn', () => {
  const events = [
    { status: 'ACTIVE', transitionAt: at('2026-05-01T09:00:00Z') },
    { status: 'FROZEN', transitionAt: at('2026-06-10T09:00:00Z') },
    { status: 'ACTIVE', transitionAt: at('2026-06-20T09:00:00Z') },
  ];
  const unused = {
    createdAt: at('2000-01-01T00:00:00Z'),
    statusChangedAt: null,
    status: 'ACTIVE',
  };

  it('reads the latest logged status at or before the instant', () => {
    expect(enrollmentStatusOn(events, at('2026-06-15T00:00:00Z'), unused)).toBe(
      'FROZEN',
    );
    expect(enrollmentStatusOn(events, at('2026-07-01T00:00:00Z'), unused)).toBe(
      'ACTIVE',
    );
  });

  it('counts a transition logged exactly at the instant', () => {
    expect(enrollmentStatusOn(events, at('2026-06-10T09:00:00Z'), unused)).toBe(
      'FROZEN',
    );
  });

  it('returns null before the first logged transition', () => {
    expect(
      enrollmentStatusOn(events, at('2026-04-30T00:00:00Z'), unused),
    ).toBeNull();
  });

  describe('an enrollment with no log rows', () => {
    const legacy = {
      createdAt: at('2026-05-01T09:00:00Z'),
      statusChangedAt: at('2026-06-01T09:00:00Z'),
      status: 'DROPPED',
    };

    it('does not exist before it was created', () => {
      expect(
        enrollmentStatusOn([], at('2026-04-01T00:00:00Z'), legacy),
      ).toBeNull();
    });

    it('is ACTIVE between creation and its status change', () => {
      expect(
        enrollmentStatusOn(undefined, at('2026-05-15T00:00:00Z'), legacy),
      ).toBe('ACTIVE');
    });

    it('has its current status from the status change on', () => {
      expect(
        enrollmentStatusOn(undefined, at('2026-06-01T09:00:00Z'), legacy),
      ).toBe('DROPPED');
    });

    it('stays ACTIVE when it never recorded when it closed', () => {
      expect(
        enrollmentStatusOn(undefined, at('2026-09-01T00:00:00Z'), {
          ...legacy,
          statusChangedAt: null,
        }),
      ).toBe('ACTIVE');
    });
  });
});
