import { isValidTransition, getAllowedTransitions } from './status-transitions';

describe('isValidTransition', () => {
  // ─── Student ───────────────────────────────────────
  it('rejects Student ACTIVE → INACTIVE (removed)', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'INACTIVE')).toBe(false);
  });

  it('allows Student ACTIVE → FROZEN', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'FROZEN')).toBe(true);
  });

  it('allows Student ACTIVE → GRADUATED', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'GRADUATED')).toBe(true);
  });

  it('allows Student ACTIVE → EXPELLED', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'EXPELLED')).toBe(true);
  });

  it('allows Student FROZEN → ACTIVE', () => {
    expect(isValidTransition('Student', 'FROZEN', 'ACTIVE')).toBe(true);
  });

  it('rejects Student FROZEN → INACTIVE (removed)', () => {
    expect(isValidTransition('Student', 'FROZEN', 'INACTIVE')).toBe(false);
  });

  it('allows Student GRADUATED → ACTIVE (re-enroll)', () => {
    expect(isValidTransition('Student', 'GRADUATED', 'ACTIVE')).toBe(true);
  });

  it('allows Student EXPELLED → ACTIVE (re-admit)', () => {
    expect(isValidTransition('Student', 'EXPELLED', 'ACTIVE')).toBe(true);
  });

  it('rejects Student GRADUATED → INACTIVE', () => {
    expect(isValidTransition('Student', 'GRADUATED', 'INACTIVE')).toBe(false);
  });

  it('allows Student GRADUATED → ARCHIVED (via delete)', () => {
    expect(isValidTransition('Student', 'GRADUATED', 'ARCHIVED')).toBe(true);
  });

  // ─── User/Teacher ─────────────────────────────────
  it('allows User ACTIVE → TERMINATED', () => {
    expect(isValidTransition('User', 'ACTIVE', 'TERMINATED')).toBe(true);
  });

  it('allows User SUSPENDED → ACTIVE', () => {
    expect(isValidTransition('User', 'SUSPENDED', 'ACTIVE')).toBe(true);
  });

  it('rejects User TERMINATED → anything (terminal)', () => {
    expect(isValidTransition('User', 'TERMINATED', 'ACTIVE')).toBe(false);
    expect(isValidTransition('User', 'TERMINATED', 'ARCHIVED')).toBe(false);
  });

  it('rejects User ACTIVE → ARCHIVED (must go through TERMINATED)', () => {
    expect(isValidTransition('User', 'ACTIVE', 'ARCHIVED')).toBe(false);
  });

  // ─── Group ────────────────────────────────────────
  it('allows Group FORMING → ACTIVE', () => {
    expect(isValidTransition('Group', 'FORMING', 'ACTIVE')).toBe(true);
  });

  it('allows Group ACTIVE → COMPLETED', () => {
    expect(isValidTransition('Group', 'ACTIVE', 'COMPLETED')).toBe(true);
  });

  it('rejects Group COMPLETED → anything (terminal)', () => {
    expect(isValidTransition('Group', 'COMPLETED', 'ACTIVE')).toBe(false);
    expect(isValidTransition('Group', 'COMPLETED', 'ARCHIVED')).toBe(false);
  });

  it('rejects Group CANCELLED → anything (terminal)', () => {
    expect(isValidTransition('Group', 'CANCELLED', 'ACTIVE')).toBe(false);
  });

  // ─── Other entities ───────────────────────────────
  it('allows Enrollment ACTIVE → FROZEN', () => {
    expect(isValidTransition('Enrollment', 'ACTIVE', 'FROZEN')).toBe(true);
  });

  it('allows Enrollment FROZEN → ACTIVE', () => {
    expect(isValidTransition('Enrollment', 'FROZEN', 'ACTIVE')).toBe(true);
  });

  it('allows Holiday ACTIVE → CANCELLED', () => {
    expect(isValidTransition('Holiday', 'ACTIVE', 'CANCELLED')).toBe(true);
  });

  it('allows Holiday CANCELLED → ACTIVE', () => {
    expect(isValidTransition('Holiday', 'CANCELLED', 'ACTIVE')).toBe(true);
  });

  it('allows Lead NEW → CONTACTED', () => {
    expect(isValidTransition('Lead', 'NEW', 'CONTACTED')).toBe(true);
  });

  it('allows Course ACTIVE → DEPRECATED', () => {
    expect(isValidTransition('Course', 'ACTIVE', 'DEPRECATED')).toBe(true);
  });

  it('allows Branch ACTIVE → CLOSED', () => {
    expect(isValidTransition('Branch', 'ACTIVE', 'CLOSED')).toBe(true);
  });

  it('allows Room ACTIVE → UNDER_MAINTENANCE', () => {
    expect(isValidTransition('Room', 'ACTIVE', 'UNDER_MAINTENANCE')).toBe(true);
  });

  // ─── Edge cases ─────────────────────────────────────
  it('returns false for unknown entity type', () => {
    expect(isValidTransition('Unknown', 'ACTIVE', 'INACTIVE')).toBe(false);
  });

  it('returns false for unknown status', () => {
    expect(isValidTransition('Student', 'NONEXISTENT', 'ACTIVE')).toBe(false);
  });

  it('returns false for same-status transition', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'ACTIVE')).toBe(false);
  });
});

describe('getAllowedTransitions', () => {
  it('returns 4 options for Student ACTIVE', () => {
    expect(getAllowedTransitions('Student', 'ACTIVE')).toEqual([
      'FROZEN',
      'GRADUATED',
      'EXPELLED',
      'ARCHIVED',
    ]);
  });

  it('returns [ACTIVE, ARCHIVED] for Student GRADUATED', () => {
    expect(getAllowedTransitions('Student', 'GRADUATED')).toEqual([
      'ACTIVE',
      'ARCHIVED',
    ]);
  });

  it('returns empty for User TERMINATED (terminal)', () => {
    expect(getAllowedTransitions('User', 'TERMINATED')).toEqual([]);
  });

  it('returns empty for Group COMPLETED (terminal)', () => {
    expect(getAllowedTransitions('Group', 'COMPLETED')).toEqual([]);
  });

  it('returns empty for Group CANCELLED (terminal)', () => {
    expect(getAllowedTransitions('Group', 'CANCELLED')).toEqual([]);
  });

  it('returns [ACTIVE] for Student ARCHIVED (restore only)', () => {
    expect(getAllowedTransitions('Student', 'ARCHIVED')).toEqual(['ACTIVE']);
  });

  it('returns empty for unknown entity/status', () => {
    expect(getAllowedTransitions('Unknown', 'ACTIVE')).toEqual([]);
    expect(getAllowedTransitions('Student', 'NONEXISTENT')).toEqual([]);
  });

  it('Holiday ACTIVE → CANCELLED, CANCELLED → ACTIVE', () => {
    expect(getAllowedTransitions('Holiday', 'ACTIVE')).toEqual(['CANCELLED']);
    expect(getAllowedTransitions('Holiday', 'CANCELLED')).toEqual(['ACTIVE']);
  });
});
