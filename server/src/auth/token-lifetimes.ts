/**
 * Token lifetimes, in seconds. CONSTANTS, not configuration, and deliberately so.
 *
 * A short access token plus a refresh endpoint is the whole design: the
 * account's real state lives in Postgres and `refresh` re-checks it, so the
 * longest anyone can act on a revoked account is one hour. `JwtAuthGuard`'s
 * Redis caches (blocked users, session versions) are written against exactly
 * that window — they exist to shorten an hour, not a week.
 *
 * `JWT_EXPIRATION` is set to "7d" in production and NOTHING READS IT. Someone
 * configured week-long sessions and got hour-long ones, with no error and no
 * way to notice. Wiring it up would not fix that — it would grant the week.
 * `env.validation.ts` now says so at startup; the variable should be removed
 * from Railway rather than honoured.
 */
export const ACCESS_TOKEN_TTL_SEC = 60 * 60;
export const REFRESH_TOKEN_TTL_SEC = 24 * 60 * 60;
