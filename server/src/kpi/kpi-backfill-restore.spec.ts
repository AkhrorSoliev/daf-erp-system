import {
  resolvingPaymentId,
  restoredConversionKind,
  type EnrollmentAtConversion,
} from './kpi-backfill-restore';

const d = (iso: string) => new Date(`${iso}T10:00:00+05:00`);
const AT = d('2026-10-18');
const enr = (
  over: Partial<EnrollmentAtConversion>,
): EnrollmentAtConversion => ({
  createdAt: d('2026-09-01'),
  statusChangedAt: null,
  status: 'ACTIVE',
  log: [],
  ...over,
});

describe('restoredConversionKind (spec §7.6)', () => {
  it('a lead not linked to a card opened a new student', () => {
    expect(restoredConversionKind(false, [enr({})], AT)).toBe('NEW_STUDENT');
  });

  it('linked to a student studying at that moment: ALREADY_STUDYING', () => {
    const log = [{ status: 'ACTIVE', transitionAt: d('2026-09-01') }];
    expect(restoredConversionKind(true, [enr({ log })], AT)).toBe(
      'ALREADY_STUDYING',
    );
    // A legacy enrollment with no log reads from its own columns.
    expect(restoredConversionKind(true, [enr({})], AT)).toBe(
      'ALREADY_STUDYING',
    );
  });

  it('linked to a student who had left, or never studied: RETURNING', () => {
    const left = [
      { status: 'ACTIVE', transitionAt: d('2026-09-01') },
      { status: 'DROPPED', transitionAt: d('2026-10-01') },
    ];
    expect(
      restoredConversionKind(true, [enr({ log: left, status: 'DROPPED' })], AT),
    ).toBe('RETURNING');
    expect(restoredConversionKind(true, [], AT)).toBe('RETURNING');
    expect(
      restoredConversionKind(true, [enr({ createdAt: d('2026-10-20') })], AT),
    ).toBe('RETURNING');
  });
});

describe('resolvingPaymentId (spec §7.6)', () => {
  // `settleKeptPromises` stamps `resolvedAt` inside the payment's own transaction,
  // after the payment row: the resolving payment is at or just before it.
  const resolvedAt = new Date('2026-10-18T05:00:30Z');
  const p = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

  it('takes the latest payment of the 60 seconds up to resolvedAt', () => {
    expect(
      resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T05:00:29Z')]),
    ).toBe('a');
    expect(
      resolvingPaymentId(resolvedAt, [
        p('a', '2026-10-18T04:59:40Z'),
        p('b', '2026-10-18T05:00:10Z'),
      ]),
    ).toBe('b');
    expect(
      resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T05:00:30Z')]),
    ).toBe('a');
  });

  it('none after resolvedAt, none older than 60 seconds', () => {
    expect(
      resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T05:00:31Z')]),
    ).toBeNull();
    expect(
      resolvingPaymentId(resolvedAt, [p('a', '2026-10-18T04:59:29Z')]),
    ).toBeNull();
    expect(resolvingPaymentId(resolvedAt, [])).toBeNull();
  });
});
