import {
  getAllowedRoleIds,
  getAllowedRoleIdsFromPortalKey,
  resolveAllowedRoleIds,
} from './portal-roles.config';

describe('portal-roles.config', () => {
  describe('getAllowedRoleIdsFromPortalKey', () => {
    it('maps student → [6]', () => {
      expect(getAllowedRoleIdsFromPortalKey('student')).toEqual([6]);
    });

    it('is case- and whitespace-insensitive', () => {
      expect(getAllowedRoleIdsFromPortalKey(' Student ')).toEqual([6]);
    });

    it('maps teacher → [4] and admin → [1,2,3,5]', () => {
      expect(getAllowedRoleIdsFromPortalKey('teacher')).toEqual([4]);
      expect(getAllowedRoleIdsFromPortalKey('admin')).toEqual([1, 2, 3, 5]);
    });

    it('returns null for unknown or undefined keys', () => {
      expect(getAllowedRoleIdsFromPortalKey('xyz')).toBeNull();
      expect(getAllowedRoleIdsFromPortalKey(undefined)).toBeNull();
    });
  });

  describe('resolveAllowedRoleIds', () => {
    it('uses X-Portal for native clients (no Origin)', () => {
      expect(resolveAllowedRoleIds(undefined, 'student')).toEqual([6]);
    });

    it('falls back to Origin when no portal key is given (web)', () => {
      expect(resolveAllowedRoleIds('https://student.dafzentrum.uz', undefined)).toEqual([6]);
      expect(resolveAllowedRoleIds('https://admin.dafzentrum.uz', undefined)).toEqual([1, 2, 3, 5]);
    });

    it('X-Portal takes precedence over Origin', () => {
      expect(resolveAllowedRoleIds('https://admin.dafzentrum.uz', 'student')).toEqual([6]);
    });

    it('returns null (no restriction) when neither matches', () => {
      expect(resolveAllowedRoleIds(undefined, undefined)).toBeNull();
      expect(resolveAllowedRoleIds('https://localhost:3000', undefined)).toBeNull();
    });
  });

  describe('getAllowedRoleIds (Origin — unchanged behaviour)', () => {
    it('maps known hosts and nulls unknown / dev', () => {
      expect(getAllowedRoleIds('https://lehrer.dafzentrum.uz')).toEqual([4]);
      expect(getAllowedRoleIds(undefined)).toBeNull();
      expect(getAllowedRoleIds('https://localhost')).toBeNull();
    });
  });
});
