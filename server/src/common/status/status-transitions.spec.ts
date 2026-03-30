import { isValidTransition, getAllowedTransitions } from './status-transitions';

describe('isValidTransition', () => {
  // ─── Valid transitions ──────────────────────────────
  it('allows Student ACTIVE → INACTIVE', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'INACTIVE')).toBe(true);
  });

  it('allows Student ACTIVE → GRADUATED', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'GRADUATED')).toBe(true);
  });

  it('allows Student ACTIVE → EXPELLED', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'EXPELLED')).toBe(true);
  });

  it('allows User ACTIVE → TERMINATED', () => {
    expect(isValidTransition('User', 'ACTIVE', 'TERMINATED')).toBe(true);
  });

  it('allows User SUSPENDED → ACTIVE (restore)', () => {
    expect(isValidTransition('User', 'SUSPENDED', 'ACTIVE')).toBe(true);
  });

  it('allows Group FORMING → ACTIVE', () => {
    expect(isValidTransition('Group', 'FORMING', 'ACTIVE')).toBe(true);
  });

  it('allows Group ACTIVE → COMPLETED', () => {
    expect(isValidTransition('Group', 'ACTIVE', 'COMPLETED')).toBe(true);
  });

  it('allows Enrollment ACTIVE → FROZEN', () => {
    expect(isValidTransition('Enrollment', 'ACTIVE', 'FROZEN')).toBe(true);
  });

  it('allows Enrollment FROZEN → ACTIVE (unfreeze)', () => {
    expect(isValidTransition('Enrollment', 'FROZEN', 'ACTIVE')).toBe(true);
  });

  it('allows Holiday ACTIVE → CANCELLED', () => {
    expect(isValidTransition('Holiday', 'ACTIVE', 'CANCELLED')).toBe(true);
  });

  it('allows Holiday CANCELLED → ACTIVE (restore)', () => {
    expect(isValidTransition('Holiday', 'CANCELLED', 'ACTIVE')).toBe(true);
  });

  it('allows Lead NEW → CONTACTED', () => {
    expect(isValidTransition('Lead', 'NEW', 'CONTACTED')).toBe(true);
  });

  it('allows Lead LOST → NEW (re-engage)', () => {
    expect(isValidTransition('Lead', 'LOST', 'NEW')).toBe(true);
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

  // ─── Invalid transitions ───────────────────────────
  it('rejects User ACTIVE → ARCHIVED (must go through TERMINATED)', () => {
    expect(isValidTransition('User', 'ACTIVE', 'ARCHIVED')).toBe(false);
  });

  it('rejects Student GRADUATED → INACTIVE (no going back)', () => {
    expect(isValidTransition('Student', 'GRADUATED', 'INACTIVE')).toBe(false);
  });

  it('rejects Student GRADUATED → ACTIVE (no going back)', () => {
    expect(isValidTransition('Student', 'GRADUATED', 'ACTIVE')).toBe(false);
  });

  it('rejects Group COMPLETED → ACTIVE (terminal)', () => {
    expect(isValidTransition('Group', 'COMPLETED', 'ACTIVE')).toBe(false);
  });

  it('rejects Enrollment COMPLETED → ACTIVE (terminal)', () => {
    expect(isValidTransition('Enrollment', 'COMPLETED', 'ACTIVE')).toBe(false);
  });

  it('rejects Enrollment DROPPED → ACTIVE (terminal)', () => {
    expect(isValidTransition('Enrollment', 'DROPPED', 'ACTIVE')).toBe(false);
  });

  it('rejects Lead CONVERTED → NEW (no going back)', () => {
    expect(isValidTransition('Lead', 'CONVERTED', 'NEW')).toBe(false);
  });

  // ─── Edge cases ─────────────────────────────────────
  it('returns false for unknown entity type', () => {
    expect(isValidTransition('Unknown', 'ACTIVE', 'INACTIVE')).toBe(false);
  });

  it('returns false for unknown status within valid entity', () => {
    expect(isValidTransition('Student', 'NONEXISTENT', 'ACTIVE')).toBe(false);
  });

  it('returns false for same-status transition', () => {
    expect(isValidTransition('Student', 'ACTIVE', 'ACTIVE')).toBe(false);
  });
});

describe('getAllowedTransitions', () => {
  it('returns [INACTIVE, GRADUATED, EXPELLED] for Student ACTIVE', () => {
    expect(getAllowedTransitions('Student', 'ACTIVE')).toEqual([
      'INACTIVE', 'GRADUATED', 'EXPELLED',
    ]);
  });

  it('returns [ACTIVE] for Student ARCHIVED (restore only)', () => {
    expect(getAllowedTransitions('Student', 'ARCHIVED')).toEqual(['ACTIVE']);
  });

  it('returns empty array for Enrollment ARCHIVED (terminal)', () => {
    expect(getAllowedTransitions('Enrollment', 'ARCHIVED')).toEqual([]);
  });

  it('returns empty array for unknown entity type', () => {
    expect(getAllowedTransitions('Unknown', 'ACTIVE')).toEqual([]);
  });

  it('returns empty array for unknown status', () => {
    expect(getAllowedTransitions('Student', 'NONEXISTENT')).toEqual([]);
  });

  it('returns [CANCELLED, ACTIVE] for Holiday', () => {
    expect(getAllowedTransitions('Holiday', 'ACTIVE')).toEqual(['CANCELLED']);
    expect(getAllowedTransitions('Holiday', 'CANCELLED')).toEqual(['ACTIVE']);
  });
});
