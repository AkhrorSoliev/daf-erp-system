import type { AuthUser } from "@/hooks/use-auth";

/**
 * Telegram Mini App ichidagi kabinet: o'quvchiniki (ADR-0040) va xodimniki
 * (ADR-0045).
 *
 * Kirish nuqtasi — `/tg` sahifasi: Telegram bergan `initData` serverga
 * yuboriladi, server Telegram akkaunti bog'langan o'quvchini yoki xodimni
 * topib sessiya beradi. Mini App ichida telefon/parol formasi hech qachon
 * ko'rsatilmaydi.
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
  /**
   * Havolani Mini App'dan tashqarida ochadi, Mini App ochiq qoladi.
   * `http(s)` dan boshqa havolaga xato otadi.
   */
  openLink(url: string): void;
  /** `activated` — Bot API 8.0+; eski klientlarda hech qachon kelmaydi. */
  onEvent(eventType: "activated", callback: () => void): void;
  offEvent(eventType: "activated", callback: () => void): void;
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

// ── Tashqi havola (Payme, Click) ──────────────────────────────────────────
//
// Mini App oynasining o'zi to'lov sahifasiga o'tsa (`location.assign`), sahifa
// Telegram'ning WebView'i ichida qoladi va u yerdan Payme yoki Click ilovasiga
// o'tib bo'lmaydi. `openLink` havolani Telegram'ga beradi: Telegram uni
// brauzerda yoki havolani o'zi ochadigan ilovada ochadi, Mini App esa orqada
// ochiq qoladi.

/**
 * Havolani Mini App'dan tashqarida ochadi. `false` — bu oyna Mini App emas
 * (Telegram skripti yo'q yoki `initData` bo'sh) yoki Telegram havolani qabul
 * qilmadi: chaqiruvchi uni o'zi ochadi.
 *
 * Telegram havolani faqat bosishga javoban ochadi: bosishdan keyin sekin
 * so'rov kutilgan bo'lsa, chaqiruvni jimgina tashlab yuborishi mumkin. Shuning
 * uchun bunday joyda havolani yangi bosish bilan qayta ochadigan tugma ham
 * bo'lishi kerak.
 */
export function openOutsideMiniApp(url: string): boolean {
  const webApp = getTelegramWebApp();
  if (!webApp?.initData) return false;
  try {
    webApp.openLink(url);
    return true;
  } catch {
    // `WebAppTgUrlInvalid` — havola http(s) emas.
    return false;
  }
}

/**
 * Telegram Mini App'ni yana ko'rsatganda chaqiriladi (`activated`). Telegram
 * ichidagi brauzer Mini App'ni sahifa yashirinmasdan yopishi mumkin — unda
 * `visibilitychange` kelmaydi, qaytishni esa Telegram shu hodisa bilan aytadi.
 * Qaytgan funksiya obunani bekor qiladi; Telegram tashqarisida hech narsa
 * qilmaydi.
 */
export function onMiniAppActivated(callback: () => void): () => void {
  const webApp = getTelegramWebApp();
  if (!webApp?.initData) return () => {};
  webApp.onEvent("activated", callback);
  return () => webApp.offEvent("activated", callback);
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

// ── Kimning kabineti (ADR-0045) ───────────────────────────────────────────
//
// Bot xodimga `lehrer.` yoki `admin.` portalidagi `/tg` ni ochadi, qolganlarga
// `student.` dagisini. Uchala portal bitta ilova: `/tg` qaysi kabinet ekanini
// xostdan biladi. Boshqa har qanday xost (lokal, tunnel) — o'quvchi kabineti,
// avvalgidek.

export type MiniAppAudience = "student" | "staff";

export function miniAppAudienceForHost(host: string): MiniAppAudience {
  return host.startsWith("lehrer.") || host.startsWith("admin.")
    ? "staff"
    : "student";
}

/** Xodim kabineti ochiladigan sahifa — o'z profili. */
export const STAFF_CABINET_HOME = "/profile";

/**
 * Botdagi tugmalar ochadigan sahifalar (`/tg?next=…`). Ro'yxatdan tashqari
 * hech narsa qabul qilinmaydi: `next` — URL'dagi, ya'ni begona qo'l yozishi
 * mumkin bo'lgan qiymat, u tashqi manzilga yo'naltirmasin.
 */
const STAFF_CABINET_PAGES = new Set([
  "/",
  "/profile",
  "/profile/salary",
  "/schedule",
  "/groups",
]);

export function staffCabinetPath(next: string | null | undefined): string {
  return next && STAFF_CABINET_PAGES.has(next) ? next : STAFF_CABINET_HOME;
}

// ── `POST /auth/telegram/webapp` va `…/webapp/staff` javoblari ─────────────

export interface MiniAppStudent {
  id: number;
  firstName: string;
  lastName: string;
}

interface MiniAppSession {
  status: "authenticated";
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

/**
 * O'quvchi kabineti. `staff` — Telegram o'quvchiga emas, xodim hisobiga
 * bog'langan: unga xodim kabinetining yo'li ko'rsatiladi.
 */
export type MiniAppSignInResult =
  | MiniAppSession
  | { status: "choose"; students: MiniAppStudent[] }
  | { status: "staff" }
  | { status: "not_registered" };

/** Xodim kabineti: tanlash yo'q — bir nechta hisob bo'lsa server rad etadi. */
export type MiniAppStaffSignInResult =
  | MiniAppSession
  | { status: "not_registered" };
