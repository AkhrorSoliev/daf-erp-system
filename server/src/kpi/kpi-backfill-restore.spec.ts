import {
  resolvingPaymentId,
  restoredConversionKind,
  type EnrollmentAtConversion,
  type WindowPayment,
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
  groupActive: true,
  ...over,
});

describe('restoredConversionKind (spec §7.6)', () => {
  it('a lead not linked to a card opened a new student', () => {
    expect(restoredConversionKind(false, [enr({})], AT, true)).toBe(
      'NEW_STUDENT',
    );
  });

  it('linked to a student studying at that moment: ALREADY_STUDYING', () => {
    const log = [{ status: 'ACTIVE', transitionAt: d('2026-09-01') }];
    expect(restoredConversionKind(true, [enr({ log })], AT, true)).toBe(
      'ALREADY_STUDYING',
    );
    // A legacy enrollment with no log reads from its own columns.
    expect(restoredConversionKind(true, [enr({})], AT, true)).toBe(
      'ALREADY_STUDYING',
    );
  });

  it('linked to a student who had left, or never studied: RETURNING', () => {
    const left = [
      { status: 'ACTIVE', transitionAt: d('2026-09-01') },
      { status: 'DROPPED', transitionAt: d('2026-10-01') },
    ];
    expect(
      restoredConversionKind(
        true,
        [enr({ log: left, status: 'DROPPED' })],
        AT,
        true,
      ),
    ).toBe('RETURNING');
    expect(restoredConversionKind(true, [], AT, true)).toBe('RETURNING');
    expect(
      restoredConversionKind(
        true,
        [enr({ createdAt: d('2026-10-20') })],
        AT,
        true,
      ),
    ).toBe('RETURNING');
  });

  it("follows the live «faol o'quvchi» rule: an ACTIVE enrollment in a group that is not active does not count", () => {
    // A stale ACTIVE enrollment left in a COMPLETED / deleted group.
    expect(
      restoredConversionKind(true, [enr({ groupActive: false })], AT, true),
    ).toBe('RETURNING');
    // One live enrollment among stale ones is enough.
    expect(
      restoredConversionKind(
        true,
        [enr({ groupActive: false }), enr({})],
        AT,
        true,
      ),
    ).toBe('ALREADY_STUDYING');
  });

  it('a student whose own status is not ACTIVE is not studying', () => {
    expect(restoredConversionKind(true, [enr({})], AT, false)).toBe(
      'RETURNING',
    );
  });
});

describe('resolvingPaymentId (spec §7.6)', () => {
  // `settleKeptPromises` stamps `resolvedAt` inside the payment's own transaction,
  // after the payment row: the resolving payment is at or just before it.
  const resolvedAt = new Date('2026-10-18T05:00:30Z');
  const p = (
    id: string,
    iso: string,
    over: Partial<WindowPayment> = {},
  ): WindowPayment => ({
    id,
    createdAt: new Date(iso),
    status: 'COMPLETED',
    correctedBy: null,
    ...over,
  });

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

  it('a payment since amount-corrected (REVERSED) links its COMPLETED re-post, as the live move does', () => {
    const corrected = p('a', '2026-10-18T05:00:10Z', {
      status: 'REVERSED',
      correctedBy: { id: 'a2', status: 'COMPLETED' },
    });
    expect(resolvingPaymentId(resolvedAt, [corrected])).toBe('a2');
  });

  it('a plain reversal, or a re-post that is itself not COMPLETED, links nothing', () => {
    expect(
      resolvingPaymentId(resolvedAt, [
        p('a', '2026-10-18T05:00:10Z', { status: 'REVERSED' }),
      ]),
    ).toBeNull();
    expect(
      resolvingPaymentId(resolvedAt, [
        p('a', '2026-10-18T05:00:10Z', {
          status: 'REVERSED',
          correctedBy: { id: 'a2', status: 'REVERSED' },
        }),
      ]),
    ).toBeNull();
  });

  it('the latest payment of the window decides, whatever an older one did', () => {
    // An older COMPLETED payment does not stand in for a newer reversed one.
    expect(
      resolvingPaymentId(resolvedAt, [
        p('a', '2026-10-18T05:00:00Z'),
        p('b', '2026-10-18T05:00:20Z', { status: 'REVERSED' }),
      ]),
    ).toBeNull();
  });
});
