import {
  ENROLLABLE_GROUP_STATUSES,
  isEnrollableGroupStatus,
} from './enrollable-statuses';

describe('enrollable group statuses', () => {
  it('takes students in a forming, active or paused group', () => {
    expect(ENROLLABLE_GROUP_STATUSES).toEqual(['ACTIVE', 'FORMING', 'PAUSED']);
    for (const s of ['ACTIVE', 'FORMING', 'PAUSED'] as const) {
      expect(isEnrollableGroupStatus(s)).toBe(true);
    }
  });

  it('refuses a completed, cancelled or archived group, and an unknown one', () => {
    for (const s of ['COMPLETED', 'CANCELLED', 'ARCHIVED'] as const) {
      expect(isEnrollableGroupStatus(s)).toBe(false);
    }
    expect(isEnrollableGroupStatus(null)).toBe(false);
    expect(isEnrollableGroupStatus(undefined)).toBe(false);
  });
});
