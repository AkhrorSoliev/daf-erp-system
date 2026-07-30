/**
 * Portal → allowed role IDs mapping
 *
 * admin.dafzentrum.uz  → CEO (1), Branch Director (2), Administrator (3), Cashier (5)
 * lehrer.dafzentrum.uz → Teacher (4)
 * student.dafzentrum.uz → Student (6)
 */
const PORTAL_ROLES: Record<string, number[]> = {
  'admin.dafzentrum.uz': [1, 2, 3, 5],
  'lehrer.dafzentrum.uz': [4],
  'student.dafzentrum.uz': [6],
};

/**
 * Origin headerdan allowed role ID larni aniqlaydi.
 * @returns number[] — faqat shu role'lar kirishi mumkin, null — cheklov yo'q (dev mode)
 */
export function getAllowedRoleIds(origin: string | undefined): number[] | null {
  if (!origin) return null;

  try {
    const { hostname } = new URL(origin);

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return null;
    }

    return PORTAL_ROLES[hostname] ?? null;
  } catch {
    return null;
  }
}

/**
 * Portal key → allowed role IDs. Native apps send an explicit `X-Portal`
 * header instead of a browser `Origin` (there is no Origin off the web).
 *
 * student → Student (6); teacher → Teacher (4); admin → CEO/BD/Admin/Cashier.
 */
const PORTAL_KEYS: Record<string, number[]> = {
  student: [6],
  teacher: [4],
  admin: [1, 2, 3, 5],
};

export function getAllowedRoleIdsFromPortalKey(
  portal: string | undefined,
): number[] | null {
  if (!portal) return null;
  return PORTAL_KEYS[portal.trim().toLowerCase()] ?? null;
}

/**
 * Resolve allowed role IDs for a login attempt. The explicit `X-Portal` key
 * (native apps) takes precedence; otherwise fall back to the browser `Origin`
 * mapping (web portals). `null` = no restriction (dev / unknown).
 */
export function resolveAllowedRoleIds(
  origin: string | undefined,
  portal: string | undefined,
): number[] | null {
  const fromPortal = getAllowedRoleIdsFromPortalKey(portal);
  if (fromPortal !== null) return fromPortal;
  return getAllowedRoleIds(origin);
}

/**
 * Ma'lum portal hostname'lari — `PORTAL_ROLES` kalitlari bilan bir manba.
 *
 * NEGA KERAK: Telegram OAuth callback foydalanuvchini portalga qaytaradi va
 * qaytish manzili `state` ichidan olinadi. Oq ro'yxatsiz bu ochiq redirect
 * bo'lib qolardi.
 */
export const PORTAL_HOSTNAMES: string[] = Object.keys(PORTAL_ROLES);

/**
 * Origin bizning portallardan biri (yoki lokal dev) ekanini bildiradi.
 *
 * NEGA SXEMA HAM TEKSHIRILADI: bu funksiya Telegram OAuth qaytish manzilini
 * tasdiqlaydi va o'sha manzilda bir martalik `handoff` kodi yuboriladi.
 * `http://admin.dafzentrum.uz` faqat hostname bo'yicha o'tib ketsa, kod
 * Cloudflare HTTPS'ga ko'tarishidan OLDIN ochiq matnda ketardi. Lokal dev
 * (`localhost` / `127.0.0.1`) http'da ishlaydi — faqat shu ikkisi istisno.
 *
 * NEGA `username`/`password` RAD ETILADI: `https://u:p@admin.dafzentrum.uz`
 * da hostname haqiqiy portal bo'ladi, lekin manzil odamga boshqacha
 * ko'rinadi. Bunday origin bizdan hech qachon chiqmaydi, shuning uchun
 * butunlay rad etamiz.
 */
export function isKnownPortalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.username || url.password) return false;
    const { hostname, protocol } = url;
    if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
    if (protocol !== 'https:') return false;
    return PORTAL_HOSTNAMES.includes(hostname);
  } catch {
    return false;
  }
}
