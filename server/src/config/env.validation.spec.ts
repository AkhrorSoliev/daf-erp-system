import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { validateEnv } from './env.validation';

/**
 * The point of these tests is the FAILURE side. A validator that only ever
 * passes is indistinguishable from no validator at all, and this one runs
 * before anything else in the process — a wrong `throw` here is a total
 * outage, so both directions are pinned.
 */
describe('validateEnv', () => {
  const minimal = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_SECRET: 'a-secret-long-enough',
  };

  const r2 = {
    R2_ACCESS_KEY_ID: 'id',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET_NAME: 'bucket',
    R2_ENDPOINT: 'https://endpoint',
    R2_PUBLIC_URL: 'https://public',
  };

  describe('required keys', () => {
    it('passes with only the two required keys set', () => {
      expect(() => validateEnv({ ...minimal })).not.toThrow();
    });

    it('returns the config unchanged so ConfigModule keeps every value', () => {
      const config = { ...minimal, SOMETHING_ELSE: 'kept' };
      expect(validateEnv(config)).toEqual(config);
    });

    it.each(['DATABASE_URL', 'JWT_SECRET'])('rejects a missing %s', (key) => {
      const config: Record<string, unknown> = { ...minimal };
      delete config[key];
      expect(() => validateEnv(config)).toThrow(key);
    });

    it('treats an empty string as missing — a dashboard `FOO=` is not config', () => {
      expect(() => validateEnv({ ...minimal, JWT_SECRET: '' })).toThrow(
        'JWT_SECRET',
      );
    });

    it('treats whitespace as missing', () => {
      expect(() => validateEnv({ ...minimal, DATABASE_URL: '   ' })).toThrow(
        'DATABASE_URL',
      );
    });
  });

  describe('JWT_SECRET length', () => {
    it('rejects a secret below the floor', () => {
      expect(() => validateEnv({ ...minimal, JWT_SECRET: 'short' })).toThrow(
        /juda qisqa/,
      );
    });

    it('never puts the secret itself in the message — it lands in deploy logs', () => {
      const secret = 'tiny';
      try {
        validateEnv({ ...minimal, JWT_SECRET: secret });
        fail('expected a throw');
      } catch (err) {
        expect((err as Error).message).not.toContain(secret);
        expect((err as Error).message).toContain('4 belgi');
      }
    });

    it('accepts exactly the minimum length', () => {
      expect(() =>
        validateEnv({ ...minimal, JWT_SECRET: '0123456789abcdef' }),
      ).not.toThrow();
    });
  });

  describe('all-or-nothing groups', () => {
    it('accepts a group that is entirely absent — the feature is simply off', () => {
      expect(() => validateEnv({ ...minimal })).not.toThrow();
    });

    it('accepts a fully configured group', () => {
      expect(() => validateEnv({ ...minimal, ...r2 })).not.toThrow();
    });

    it('rejects a half-configured group and names what is missing', () => {
      const config = { ...minimal, ...r2 };
      delete (config as Record<string, unknown>).R2_PUBLIC_URL;
      expect(() => validateEnv(config)).toThrow('R2_PUBLIC_URL');
    });

    it('rejects a group where one key was blanked out rather than removed', () => {
      expect(() =>
        validateEnv({ ...minimal, ...r2, R2_BUCKET_NAME: '' }),
      ).toThrow('R2_BUCKET_NAME');
    });

    it('lists every missing key of a group, not just the first', () => {
      expect(() =>
        validateEnv({
          ...minimal,
          ESKIZ_EMAIL: 'a@b.uz',
        }),
      ).toThrow(/ESKIZ_PASSWORD.*ESKIZ_FROM|ESKIZ_FROM.*ESKIZ_PASSWORD/);
    });

    it('reports several broken groups in one message, so one deploy fixes all', () => {
      let message = '';
      try {
        validateEnv({
          ...minimal,
          R2_BUCKET_NAME: 'bucket',
          PAYME_MERCHANT_ID: 'id',
        });
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toContain('R2_');
      expect(message).toContain('PAYME_MERCHANT_KEY');
    });
  });

  describe('the CI and production shapes', () => {
    it("accepts CI's placeholder environment", () => {
      expect(() =>
        validateEnv({
          DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci?schema=public',
          JWT_SECRET: 'ci-test-secret-value',
          NODE_ENV: 'test',
        }),
      ).not.toThrow();
    });

    it('accepts the full production shape', () => {
      expect(() =>
        validateEnv({
          ...minimal,
          ...r2,
          ESKIZ_EMAIL: 'a@b.uz',
          ESKIZ_PASSWORD: 'pw',
          ESKIZ_FROM: '4546',
          TELEGRAM_OAUTH_CLIENT_ID: 'id',
          TELEGRAM_OAUTH_CLIENT_SECRET: 'secret',
          TELEGRAM_OAUTH_REDIRECT_URI: 'https://redirect',
          VAPID_PUBLIC_KEY: 'pub',
          VAPID_PRIVATE_KEY: 'priv',
          VAPID_EMAIL: 'mailto:a@b.uz',
          PAYME_MERCHANT_ID: 'id',
          PAYME_MERCHANT_KEY: 'key',
          CLICK_MERCHANT_ID: 'id',
          CLICK_SERVICE_ID: 'sid',
          CLICK_SECRET_KEY: 'key',
          CLICK_MERCHANT_USER_ID: 'uid',
        }),
      ).not.toThrow();
    });
  });

  /**
   * The function above is only useful if Nest actually calls it. This is the
   * wiring, not the logic: a `validate` with the wrong shape is accepted
   * silently by `forRoot` and simply never runs — the exact failure mode this
   * whole file exists to prevent, reproduced one level up.
   */
  describe('wired into ConfigModule', () => {
    const saved = { ...process.env };
    afterEach(() => {
      process.env = { ...saved };
    });

    async function boot() {
      await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true, // hermetic: never read the developer's .env
            validate: validateEnv,
          }),
        ],
      }).compile();
    }

    it('starts when the environment is complete', async () => {
      process.env = { ...minimal } as NodeJS.ProcessEnv;
      await expect(boot()).resolves.toBeUndefined();
    });

    it('refuses to start when a required key is missing', async () => {
      process.env = { DATABASE_URL: minimal.DATABASE_URL } as NodeJS.ProcessEnv;
      await expect(boot()).rejects.toThrow('JWT_SECRET');
    });

    it('refuses to start on a half-configured integration', async () => {
      process.env = {
        ...minimal,
        R2_BUCKET_NAME: 'bucket',
      } as NodeJS.ProcessEnv;
      await expect(boot()).rejects.toThrow('R2_ACCESS_KEY_ID');
    });
  });

  /**
   * A variable that is set and read by nothing is the quietest configuration
   * mistake there is: the dashboard says one thing, the system does another,
   * and nothing disagrees out loud. `JWT_EXPIRATION=7d` sat in production
   * while every access token expired in an hour.
   */
  describe('variables nothing reads', () => {
    function warningsFor(config: Record<string, unknown>): string {
      const lines: string[] = [];
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation((message) => {
          lines.push(String(message));
        });
      validateEnv(config);
      warn.mockRestore();
      return lines.join('\n');
    }

    it('names JWT_EXPIRATION, and says the lifetimes are constants', () => {
      const text = warningsFor({ ...minimal, JWT_EXPIRATION: '7d' });
      expect(text).toContain('JWT_EXPIRATION');
      expect(text).toContain('auth.service.ts');
    });

    it('says nothing when none of them is set', () => {
      const text = warningsFor({ ...minimal });
      expect(text).not.toContain('JWT_EXPIRATION');
    });

    it('warns rather than refusing — a stale variable is not a bad deploy', () => {
      expect(() =>
        validateEnv({
          ...minimal,
          JWT_EXPIRATION: '7d',
          OPENAI_API_KEY: 'sk-x',
        }),
      ).not.toThrow();
    });

    it('lists every one that is set, not just the first', () => {
      const text = warningsFor({
        ...minimal,
        JWT_EXPIRATION: '7d',
        R2_ACCOUNT_ID: 'acct',
      });
      expect(text).toContain('JWT_EXPIRATION');
      expect(text).toContain('R2_ACCOUNT_ID');
    });
  });
});
