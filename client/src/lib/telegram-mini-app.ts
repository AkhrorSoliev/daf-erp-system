import type { AuthUser } from "@/hooks/use-auth";

/**
 * Telegram Mini App ichidagi o'quvchi kabineti (ADR-0039).
 *
 * Kirish nuqtasi — `/tg` sahifasi: Telegram bergan `initData` serverga
 * yuboriladi, server Telegram akkaunti bog'langan o'quvchini topib sessiya
 * beradi. Mini App ichida telefon/parol formasi hech qachon ko'rsatilmaydi.
 */

export const TELEGRAM_WEB_APP_SCRIPT =
  "https://telegram.org/js/telegram-web-app.js";

/** Mini App'ning kirish sahifasi (middleware'da ochiq). */
export const MINI_APP_ENTRY_PATH = "/tg";

/** `window.Telegram.WebApp` ning biz ishlatadigan qismi. */
export interface TelegramWebApp {
  /** Imzolangan xom query-string; Telegram tashqarisida bo'sh satr. */
  initData: string;
  ready(): void;
  expand(): void;
  close(): void;
  /** Bot API 7.7+; eski klientlarda yo'q. */
  disableVerticalSwipes?: () => void;
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const telegram = (window as { Telegram?: { WebApp?: TelegramWebApp } })
    .Telegram;
  return telegram?.WebApp ?? null;
}

/** Mini App'ni yopadi; Telegram tashqarisida hech narsa qilmaydi. */
export function closeMiniApp(): void {
  getTelegramWebApp()?.close();
}

// ── «Bu oyna — Mini App» belgisi ──────────────────────────────────────────
//
// sessionStorage'da, cookie'da EMAS: belgi Mini App'ning o'z oynasi bilan
// o'lishi kerak. Android'da Telegram'ning ichki brauzeri Mini App bilan bitta
// cookie idishini bo'lishadi — cookie bo'lsa, o'sha brauzerda ochilgan oddiy
// portal sahifasi ham o'zini Mini App deb o'ylardi.

const MINI_APP_KEY = "tgMiniApp";
const SIGNED_OUT_KEY = "tgMiniAppSignedOut";

function readFlag(key: string): boolean {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    // SSR (window yo'q) yoki bloklangan storage — belgi yo'q deb hisoblaymiz.
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage yo'q bo'lsa belgi shunchaki saqlanmaydi.
  }
}

/** Bu oyna Mini App sifatida ochilganmi (`/tg` belgilagan). */
export const isMiniAppSession = () => readFlag(MINI_APP_KEY);

export const markMiniAppSession = () => writeFlag(MINI_APP_KEY, true);

/**
 * O'quvchi Mini App ichida «Chiqish»ni bosganmi. Belgi bo'lsa `/tg` qayta
 * avtomatik kirmaydi — «Qayta kirish» tugmasini kutadi; aks holda chiqish
 * bir soniyada o'zi bekor bo'lardi.
 */
export const wasSignedOutInMiniApp = () => readFlag(SIGNED_OUT_KEY);

export const markMiniAppSignedOut = (signedOut: boolean) =>
  writeFlag(SIGNED_OUT_KEY, signedOut);

// ── Kirish saqlanmagani (aylanishga qarshi) ───────────────────────────────
//
// Telegram Web (brauzer) Mini App'ni iframe ichida ochadi, va u yerda sessiya
// cookie'lari `/portal` so'rovlari bilan yuborilmasligi mumkin. Unda middleware
// `/login` ga, `MiniAppLoginGuard` esa yana `/tg` ga qaytaradi — `/tg` kirib,
// yana `/portal` ga jo'natardi: cheksiz aylanish. Muvaffaqiyatli kirish vaqti
// yoziladi; shundan keyin tez orada `/tg` ga qaytib kelinsa, kirish
// saqlanmagan deb hisoblanadi va aylanish o'rniga xabar ko'rsatiladi.

const SIGNED_IN_AT_KEY = "tgMiniAppSignedInAt";

/** Kirishdan keyin shu vaqt ichida `/tg` ga qaytish — kirish saqlanmagani. */
export const SIGN_IN_BOUNCE_MS = 30_000;

export function markMiniAppSignedIn(now: number = Date.now()): void {
  try {
    window.sessionStorage.setItem(SIGNED_IN_AT_KEY, String(now));
  } catch {
    // Storage yo'q bo'lsa himoya ham yo'q — lekin kirish ishlaydi.
  }
}

export function clearMiniAppSignedIn(): void {
  writeFlag(SIGNED_IN_AT_KEY, false);
}

export function bouncedAfterSignIn(now: number = Date.now()): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(SIGNED_IN_AT_KEY));
    return at > 0 && now >= at && now - at < SIGN_IN_BOUNCE_MS;
  } catch {
    return false;
  }
}

// ── `POST /auth/telegram/webapp` javobi ───────────────────────────────────

export interface MiniAppStudent {
  id: number;
  firstName: string;
  lastName: string;
}

export type MiniAppSignInResult =
  | {
      status: "authenticated";
      accessToken: string;
      refreshToken: string;
      user: AuthUser;
    }
  | { status: "choose"; students: MiniAppStudent[] }
  | { status: "not_registered" };
