import { Logger } from '@nestjs/common';

/**
 * Startup validation for the server's environment.
 *
 * WHY THIS EXISTS: this API is deployed by hand (`railway up`), and Railway's
 * variables are edited in a web UI that has no connection to the repository.
 * A renamed, deleted or mistyped key therefore produces a server that BOOTS
 * NORMALLY and passes its health check — the failure surfaces later, on the
 * first request that happens to need the value, as a 500 nobody is watching:
 *
 *   - `JWT_SECRET` missing → `secretOrKey: undefined`; the app starts, every
 *     login throws.
 *   - `R2_*` missing → `S3Client` is constructed with `accessKeyId: undefined`;
 *     uploads fail only when someone uploads.
 *   - `ESKIZ_*` missing → password-reset SMS fails inside a `try/catch` that
 *     deliberately returns the same generic message either way, so the user
 *     sees "kod yuborildi" and no code ever arrives.
 *
 * Each of those is invisible until a person hits it. Refusing to start is the
 * loud alternative: a bad deploy fails in the deploy log, in front of the
 * person who caused it, instead of days later in front of a user.
 *
 * The rules are deliberately narrow, because a validator that is too strict is
 * an outage of its own:
 *
 *   - REQUIRED: only the two keys without which nothing works at all.
 *   - GROUPS: an integration is optional as a whole, but PARTIAL config is
 *     rejected. Half a group is never intentional — it is the exact shape a
 *     typo or a half-finished migration leaves behind, and it fails at runtime
 *     rather than at boot.
 *   - A group that is entirely absent is legitimate (that feature is off) and
 *     only logged, so `CRONS_ENABLED=false` laptops and CI keep working.
 */

/** Keys the server cannot run without. */
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET'] as const;

/**
 * All-or-nothing integrations. Absent = the feature is off (logged). Partially
 * set = a configuration mistake (throws).
 */
const GROUPS: { feature: string; keys: string[] }[] = [
  {
    feature: 'Fayl yuklash (Cloudflare R2)',
    keys: [
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET_NAME',
      'R2_ENDPOINT',
      'R2_PUBLIC_URL',
    ],
  },
  {
    feature: 'SMS va parol tiklash (Eskiz)',
    keys: ['ESKIZ_EMAIL', 'ESKIZ_PASSWORD', 'ESKIZ_FROM'],
  },
  {
    feature: 'Telegram OAuth kirish',
    keys: [
      'TELEGRAM_OAUTH_CLIENT_ID',
      'TELEGRAM_OAUTH_CLIENT_SECRET',
      'TELEGRAM_OAUTH_REDIRECT_URI',
    ],
  },
  {
    feature: 'Push bildirishnoma (VAPID)',
    keys: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_EMAIL'],
  },
  {
    feature: "Payme to'lov shlyuzi",
    keys: ['PAYME_MERCHANT_ID', 'PAYME_MERCHANT_KEY'],
  },
  {
    feature: "Click to'lov shlyuzi",
    keys: [
      'CLICK_MERCHANT_ID',
      'CLICK_SERVICE_ID',
      'CLICK_SECRET_KEY',
      'CLICK_MERCHANT_USER_ID',
    ],
  },
];

/**
 * A JWT signing key short enough to brute-force is not much better than none.
 * 16 is a floor, not a recommendation — production currently runs 29.
 */
const MIN_JWT_SECRET_LENGTH = 16;

/** Present AND non-blank. `FOO=` in a dashboard is an empty string, not absent. */
function isSet(config: Record<string, unknown>, key: string): boolean {
  const value = config[key];
  return typeof value === 'string' && value.trim().length > 0;
}

export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const logger = new Logger('EnvValidation');
  const errors: string[] = [];
  const disabled: string[] = [];

  for (const key of REQUIRED) {
    if (!isSet(config, key))
      errors.push(`${key} — majburiy, lekin o'rnatilmagan`);
  }

  if (isSet(config, 'JWT_SECRET')) {
    const length = String(config.JWT_SECRET).trim().length;
    if (length < MIN_JWT_SECRET_LENGTH) {
      // The length, never the value — this string ends up in deploy logs.
      errors.push(
        `JWT_SECRET — juda qisqa (${length} belgi, kamida ${MIN_JWT_SECRET_LENGTH} kerak)`,
      );
    }
  }

  for (const { feature, keys } of GROUPS) {
    const missing = keys.filter((key) => !isSet(config, key));
    if (missing.length === 0) continue;
    if (missing.length === keys.length) {
      disabled.push(feature);
      continue;
    }
    errors.push(
      `${feature} — yarim sozlangan. Yetishmayapti: ${missing.join(', ')}`,
    );
  }

  if (errors.length > 0) {
    throw new Error(
      "Muhit sozlamalari noto'g'ri — server ishga tushmaydi:\n" +
        errors.map((e) => `  • ${e}`).join('\n') +
        "\n\nRailway → Variables bo'limini tekshiring.",
    );
  }

  if (disabled.length > 0) {
    // Not an error: a laptop pointed at production, or CI, legitimately runs
    // without these. But it must be VISIBLE, so nobody debugs a dead feature
    // for an hour before checking whether it was ever switched on.
    logger.warn(
      `Sozlanmagan integratsiyalar (bu funksiyalar o'chiq): ${disabled.join(' · ')}`,
    );
  }

  return config;
}
