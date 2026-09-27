import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Telegram Mini App'ning `initData` satrini tekshiradi (ADR-0039).
 *
 * `initData` — Telegram Mini App'ni ochganda WebView'ga beradigan query-string:
 * `user` (JSON), `auth_date`, `hash` va boshqa maydonlar. `hash` — qolgan
 * maydonlarning bot tokeni bilan olingan HMAC-SHA256 imzosi, ya'ni uni faqat
 * Telegram (va tokenni biladigan biz) yasay oladi. Imzo to'g'ri bo'lsa, `user.id`
 * — Mini App'ni AYNAN shu Telegram akkaunt ochgani haqidagi Telegram'ning o'z
 * guvohligi.
 *
 * Algoritm (Telegram hujjati, aiogram'ning `check_webapp_signature` bilan bir xil):
 *   data_check_string = `hash` dan boshqa BARCHA maydonlar, kalit bo'yicha
 *                       saralangan, `key=value`, `\n` bilan ulangan;
 *   secret_key        = HMAC_SHA256(kalit = "WebAppData", xabar = bot_token);
 *   hash              = hex(HMAC_SHA256(kalit = secret_key, xabar = data_check_string)).
 * `signature` maydoni (Bot API 8.0, uchinchi tomon tekshiruvi uchun) ham
 * satrga kiradi — Telegram `hash`ni undan keyin hisoblaydi.
 */

/**
 * `auth_date` dan keyin `initData` qancha vaqt qabul qilinadi.
 *
 * Telegram `initData` ni Mini App OCHILGANDA beradi va u ochiq turguncha
 * o'zgarmaydi. Ochilishda kirish bir necha soniya oladi, lekin shu oynada
 * keyinroq ham kerak bo'ladi: «Chiqish» → «Qayta kirish» va sessiya tugagandan
 * keyingi qayta kirish shu satr bilan boradi. Bir soat — bitta o'tirishga
 * yetadi, sizib chiqqan satrni esa uzoq yashaydigan kalitga aylantirmaydi
 * (refresh token 24 soat yashaydi). Undan eski satr bilan kelgan odamga Mini
 * App'ni qayta ochish aytiladi — qayta ochilishda Telegram yangisini beradi.
 */
export const INIT_DATA_MAX_AGE_SEC = 60 * 60;

/**
 * `auth_date` bizning soatdan shuncha oldinda bo'lsa ham qabul qilinadi:
 * Telegram serverining soati va Railway'niki bitta soat emas. Undan ko'prog'i
 * soat farqi emas.
 */
const FUTURE_SKEW_SEC = 60;

export type InitDataRejection =
  /** Satr shakli buzilgan: `hash` yo'q, kalit takrorlangan, `auth_date` son emas. */
  | 'malformed'
  /** Imzo mos kelmadi — satrni Telegram yasamagan yoki u o'zgartirilgan. */
  | 'bad_signature'
  /** Imzo to'g'ri, lekin `auth_date` eskirgan (yoki kelajakda). */
  | 'expired'
  /** Imzo to'g'ri, lekin `user.id` yo'q yoki butun musbat son emas. */
  | 'no_user';

export type InitDataCheck =
  | {
      ok: true;
      /**
       * Telegram foydalanuvchi id'si, satr ko'rinishida — `Student.telegramChatId`
       * bilan bir turda. Bot bilan shaxsiy chatda `chat.id` foydalanuvchining
       * `id`si bilan bir xil, bot aynan shu qiymatni yozadi.
       */
      telegramUserId: string;
    }
  | { ok: false; reason: InitDataRejection };

const HASH_RE = /^[0-9a-f]{64}$/i;

export function checkInitData(
  initData: string,
  botToken: string,
  nowSec: number,
): InitDataCheck {
  // Takrorlangan kalit — rad. `URLSearchParams.get` birinchisini, `Map` esa
  // oxirgisini oladi: imzo bitta nusxa bo'yicha tekshirilib, qiymat boshqasidan
  // o'qilsa, imzolangan satrga qo'shilgan ikkinchi `user=` o'tib ketardi.
  // Telegram hech qachon kalitni takrorlamaydi.
  const fields = new Map<string, string>();
  for (const [key, value] of new URLSearchParams(initData)) {
    if (fields.has(key)) return { ok: false, reason: 'malformed' };
    fields.set(key, value);
  }

  const hash = fields.get('hash');
  if (!hash || !HASH_RE.test(hash)) return { ok: false, reason: 'malformed' };
  fields.delete('hash');

  // Saralash kod birligi bo'yicha, `localeCompare` bilan EMAS: tartib
  // serverning tiliga bog'liq bo'lib qolmasin (kalitlar — lotin harflari va `_`).
  const dataCheckString = [...fields.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();
  const expected = createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest();
  // Ikkalasi ham 32 bayt (`HASH_RE` 64 hex belgini kafolatlaydi).
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) {
    return { ok: false, reason: 'bad_signature' };
  }

  // Maydonlar faqat imzo tasdiqlangandan KEYIN o'qiladi: undan oldin ular
  // yuboruvchi yozgan istalgan narsa.
  const authDate = Number(fields.get('auth_date'));
  if (!Number.isSafeInteger(authDate) || authDate <= 0) {
    return { ok: false, reason: 'malformed' };
  }
  if (
    nowSec - authDate > INIT_DATA_MAX_AGE_SEC ||
    authDate - nowSec > FUTURE_SKEW_SEC
  ) {
    return { ok: false, reason: 'expired' };
  }

  const telegramUserId = parseUserId(fields.get('user'));
  if (!telegramUserId) return { ok: false, reason: 'no_user' };
  return { ok: true, telegramUserId };
}

/**
 * `user` JSON'idagi `id`, satr ko'rinishida.
 *
 * Telegram id 52 bitdan oshmaydi, ya'ni JSON soni sifatida aniq o'qiladi;
 * `isSafeInteger` shunga qaramay tekshiriladi — undan katta qiymat aniqlikni
 * jimgina yo'qotib, BOSHQA odamning id'siga aylanib qolardi. Satr ko'rinishidagi
 * id qabul qilinmaydi: Telegram uni son qilib yuboradi.
 */
function parseUserId(raw: string | undefined): string | null {
  if (!raw) return null;
  let user: unknown;
  try {
    user = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof user !== 'object' || user === null) return null;
  const id = (user as { id?: unknown }).id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0
    ? String(id)
    : null;
}
