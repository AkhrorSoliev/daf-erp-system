import { Logger } from '@nestjs/common';
import { ACCESS_TOKEN_TTL_SEC } from '../../auth/token-lifetimes';
import {
  SESSION_VERSION_CACHE_TTL_SEC,
  endSessionsWrite,
  passwordWrite,
  recordSessionsEnded,
  sessionVersionKey,
  tokenSessionVersion,
} from './session-version';

describe('session version (ADR-0029)', () => {
  describe('tokenSessionVersion', () => {
    it('reads the version a token carries', () => {
      expect(tokenSessionVersion({ sv: 3 })).toBe(3);
      expect(tokenSessionVersion({ sv: 0 })).toBe(0);
    });

    it('counts a token minted before the claim existed as version 0', () => {
      // Every account starts at 0, so the deploy signs nobody out.
      expect(tokenSessionVersion({})).toBe(0);
    });

    it.each([['3'], [-1], [1.5], [null], [NaN], [{}]])(
      'refuses a malformed version (%p)',
      (sv) => {
        expect(tokenSessionVersion({ sv })).toBeNull();
      },
    );
  });

  describe('writes', () => {
    it('ends sessions with an increment, never an absolute value', () => {
      // An absolute write would let two concurrent bumps collapse into one.
      expect(endSessionsWrite()).toEqual({ sessionVersion: { increment: 1 } });
    });

    it('puts the password and the bump in the same data object', () => {
      expect(passwordWrite('$2b$10$hash')).toEqual({
        password: '$2b$10$hash',
        sessionVersion: { increment: 1 },
      });
    });

    it('ends sessions when the password is cleared too', () => {
      expect(passwordWrite(null)).toEqual({
        password: null,
        sessionVersion: { increment: 1 },
      });
    });
  });

  describe('recordSessionsEnded', () => {
    it('mirrors the new version for longer than an access token lives', async () => {
      const redis = { set: jest.fn().mockResolvedValue('OK') };

      await recordSessionsEnded(redis as never, 10505, 4);

      expect(sessionVersionKey(10505)).toBe('user:session-version:10505');
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:10505',
        '4',
        'EX',
        SESSION_VERSION_CACHE_TTL_SEC,
      );
      expect(SESSION_VERSION_CACHE_TTL_SEC).toBeGreaterThan(
        ACCESS_TOKEN_TTL_SEC,
      );
    });

    it('never fails the password change when Redis is down', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const redis = {
        set: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };

      await expect(
        recordSessionsEnded(redis as never, 10505, 4),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('user 10505'));
      warn.mockRestore();
    });
  });
});
