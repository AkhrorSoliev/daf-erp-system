import {
  getAllowedRoleIds,
  getAllowedRoleIdsFromPortalKey,
  isKnownPortalOrigin,
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
      expect(
        resolveAllowedRoleIds('https://student.dafzentrum.uz', undefined),
      ).toEqual([6]);
      expect(
        resolveAllowedRoleIds('https://admin.dafzentrum.uz', undefined),
      ).toEqual([1, 2, 3, 5]);
    });

    it('X-Portal takes precedence over Origin', () => {
      expect(
        resolveAllowedRoleIds('https://admin.dafzentrum.uz', 'student'),
      ).toEqual([6]);
    });

    it('returns null (no restriction) when neither matches', () => {
      expect(resolveAllowedRoleIds(undefined, undefined)).toBeNull();
      expect(
        resolveAllowedRoleIds('https://localhost:3000', undefined),
      ).toBeNull();
    });
  });

  describe('getAllowedRoleIds (Origin — unchanged behaviour)', () => {
    it('maps known hosts and nulls unknown / dev', () => {
      expect(getAllowedRoleIds('https://lehrer.dafzentrum.uz')).toEqual([4]);
      expect(getAllowedRoleIds(undefined)).toBeNull();
      expect(getAllowedRoleIds('https://localhost')).toBeNull();
    });
  });

  describe('isKnownPortalOrigin', () => {
    it('accepts the three portals over https', () => {
      expect(isKnownPortalOrigin('https://admin.dafzentrum.uz')).toBe(true);
      expect(isKnownPortalOrigin('https://lehrer.dafzentrum.uz')).toBe(true);
      expect(isKnownPortalOrigin('https://student.dafzentrum.uz')).toBe(true);
    });

    it('rejects a portal hostname over plain http', () => {
      // The redirect carries the single-use handoff. Over http it would travel
      // in cleartext before Cloudflare's upgrade could intervene.
      expect(isKnownPortalOrigin('http://admin.dafzentrum.uz')).toBe(false);
      expect(isKnownPortalOrigin('http://student.dafzentrum.uz')).toBe(false);
    });

    it('still allows local dev over http (localhost / 127.0.0.1)', () => {
      expect(isKnownPortalOrigin('http://localhost:3000')).toBe(true);
      expect(isKnownPortalOrigin('http://127.0.0.1:3000')).toBe(true);
    });

    it('rejects an origin carrying userinfo even when the host is a portal', () => {
      // `https://u:p@admin.dafzentrum.uz` has a genuine portal hostname but
      // reads as a different address to a human. It never comes from us.
      expect(isKnownPortalOrigin('https://user:pass@admin.dafzentrum.uz')).toBe(
        false,
      );
      expect(isKnownPortalOrigin('https://user@admin.dafzentrum.uz')).toBe(
        false,
      );
      expect(isKnownPortalOrigin('http://user:pass@localhost:3000')).toBe(
        false,
      );
    });

    it('rejects unknown hosts, junk and undefined', () => {
      expect(isKnownPortalOrigin('https://evil.example.com')).toBe(false);
      expect(isKnownPortalOrigin('client-brown-ten-36.vercel.app')).toBe(false);
      expect(
        isKnownPortalOrigin('https://client-brown-ten-36.vercel.app'),
      ).toBe(false);
      expect(isKnownPortalOrigin('not a url')).toBe(false);
      expect(isKnownPortalOrigin(undefined)).toBe(false);
      expect(isKnownPortalOrigin('')).toBe(false);
    });
  });
});
