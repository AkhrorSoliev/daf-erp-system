import { formatStudent } from './student-select';

/** The raw row `studentSelect` returns, with the relations left empty. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 10077,
    firstName: 'Nodira',
    lastName: 'Qodirova',
    phone: '901234567',
    telegramChatId: null,
    verifiedPhone: null,
    phoneVerifiedAt: null,
    dateOfBirth: null,
    companyId: 1,
    deletedAt: null,
    deletedBy: null,
    branches: [],
    enrollments: [],
    ...overrides,
  };
}

describe('formatStudent — phone proof on the staff card (ADR-0039)', () => {
  const PROVED_AT = new Date('2026-09-27T06:30:00.000Z');

  it('reports the card number as proved, with when', () => {
    const out = formatStudent(
      row({ verifiedPhone: '901234567', phoneVerifiedAt: PROVED_AT }),
    );
    expect(out.phoneVerified).toBe(true);
    expect(out.phoneVerifiedAt).toBe('2026-09-27T06:30:00.000Z');
  });

  it('reports an unproved card as such', () => {
    const out = formatStudent(row());
    expect(out.phoneVerified).toBe(false);
    expect(out.phoneVerifiedAt).toBeNull();
  });

  it('a proof of the number the card no longer carries does not count', () => {
    // Staff changed the phone after the student proved the old one.
    const out = formatStudent(
      row({
        phone: '935554433',
        verifiedPhone: '901234567',
        phoneVerifiedAt: PROVED_AT,
      }),
    );
    expect(out.phoneVerified).toBe(false);
    expect(out.phoneVerifiedAt).toBeNull();
  });

  it('never hands out the proved number itself — only the verdict', () => {
    const out = formatStudent(
      row({ verifiedPhone: '901234567', phoneVerifiedAt: PROVED_AT }),
    );
    expect(out).not.toHaveProperty('verifiedPhone');
  });
});
