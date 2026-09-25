import {
  enrollmentStatusOn,
  supplyOpeningRow,
  type EnrollmentStatusEvent,
} from './enrollment-status-on';

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

describe('supplyOpeningRow', () => {
  // An enrollment opened before the log existed (up to 2026-04-26) can
  // have only its later rows: the log starts with the closing.
  const OPENED = at('2026-04-10T09:00:00Z');
  const CLOSED = at('2026-06-15T09:00:00Z');

  it.each(['DROPPED', 'FROZEN', 'TRANSFERRED'])(
    'gives a log that starts with %s after the creation its opening ACTIVE row',
    (status) => {
      const log = [{ status, transitionAt: CLOSED }];

      supplyOpeningRow(log, OPENED);

      expect(log).toEqual([
        { status: 'ACTIVE', transitionAt: OPENED },
        { status, transitionAt: CLOSED },
      ]);
    },
  );

  it('adds nothing when the first row is not later than the creation', () => {
    // A first row at the creation itself was the opening.
    const atCreation = [{ status: 'DROPPED', transitionAt: OPENED }];
    const beforeCreation = [
      { status: 'DROPPED', transitionAt: at('2026-04-09T09:00:00Z') },
    ];

    supplyOpeningRow(atCreation, OPENED);
    supplyOpeningRow(beforeCreation, OPENED);

    expect(atCreation).toEqual([{ status: 'DROPPED', transitionAt: OPENED }]);
    expect(beforeCreation).toEqual([
      { status: 'DROPPED', transitionAt: at('2026-04-09T09:00:00Z') },
    ]);
  });

  it('adds nothing to a log that already opens with ACTIVE', () => {
    // A restore logs ACTIVE at the restore itself, later than the creation.
    const log = [
      { status: 'ACTIVE', transitionAt: at('2026-05-20T09:00:00Z') },
      { status: 'DROPPED', transitionAt: CLOSED },
    ];

    supplyOpeningRow(log, OPENED);

    expect(log).toEqual([
      { status: 'ACTIVE', transitionAt: at('2026-05-20T09:00:00Z') },
      { status: 'DROPPED', transitionAt: CLOSED },
    ]);
  });

  it('leaves an empty log to the fallback from the enrollment row', () => {
    const log: EnrollmentStatusEvent[] = [];

    supplyOpeningRow(log, OPENED);

    expect(log).toEqual([]);
  });
});
