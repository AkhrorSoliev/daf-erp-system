import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
} from '../../auth/token-lifetimes';

/*
 * Qurilmalar ro'yxati (ADR-0112): har kirish bitta `UserSession` qatori.
 *
 * Token `sid` (qator id) ko'taradi. Qator `refresh` da tekshiriladi (bazaga
 * qarab), `JwtAuthGuard` esa o'chirilgan qurilmaning access token'ini Redis
 * belgisi orqali keyingi so'rovdayoq to'xtatadi. Hisob darajasidagi
 * `sessionVersion` (ADR-0030) o'z o'rnida qoladi: parol o'zgarsa hamma
 * qurilma tugaydi, qatorlar esa versiyasi orqada qolgani uchun ro'yxatda
 * ko'rinmaydi.
 */

/** Qurilma haqida server biladigan hamma narsa (so'rov sarlavhalaridan). */
export interface SessionMeta {
  userAgent?: string | null;
  ip?: string | null;
}

const META_MAX = 300;

/** Redis belgisi: shu `sid` o'chirilgan. Access token muddati tugaguncha kerak. */
export function sessionRevokedKey(sid: string): string {
  return `user:session-revoked:${sid}`;
}

export const SESSION_REVOKED_CACHE_TTL_SEC = ACCESS_TOKEN_TTL_SEC + 5 * 60;

/**
 * Bundan eski `lastUsedAt` — refresh token allaqachon o'lgan, qurilma tirik
 * emas. Ro'yxat ham, tozalash ham shu chegaradan foydalanadi.
 */
export function activeSessionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - REFRESH_TOKEN_TTL_SEC * 1000);
}

/**
 * So'rovdan qurilma belgilari. `x-forwarded-for` ni mijoz o'zi yozishi
 * mumkin, shuning uchun IP faqat ko'rsatish uchun — hech qanday qaror unga
 * tayanmaydi.
 */
export function clientMeta(req: any): SessionMeta {
  const ua = req?.headers?.['user-agent'];
  const fwd = req?.headers?.['x-forwarded-for'];
  const ip =
    typeof fwd === 'string' && fwd.length ? fwd.split(',')[0].trim() : req?.ip;
  return {
    userAgent: typeof ua === 'string' ? ua.slice(0, META_MAX) : null,
    ip: typeof ip === 'string' ? ip.slice(0, 64) : null,
  };
}

/** Brauzer va OT nomi — `User-Agent` dan, kutubxonasiz. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? '';
  if (!ua) return "Noma'lum qurilma";

  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux|X11/.test(ua)
            ? 'Linux'
            : null;

  // Tartib muhim: Edge/Opera/Samsung o'zini "Chrome" deb ham ataydi.
  const browser = /Telegram/i.test(ua)
    ? 'Telegram'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /Firefox|FxiOS/.test(ua)
            ? 'Firefox'
            : /Chrome|CriOS/.test(ua)
              ? 'Chrome'
              : /Safari/.test(ua)
                ? 'Safari'
                : null;

  if (browser && os) return `${browser} · ${os}`;
  return browser ?? os ?? "Noma'lum qurilma";
}
