// Throttling
export const TG_GROUP_THROTTLE_KEY_PREFIX = 'tg-group:throttle:';
export const TG_GROUP_THROTTLE_SECONDS = 30;

// Digest buffering
// Per-company Redis list of pending events; flushed every 3h by
// TelegramGroupDigestCronService into a single consolidated message.
export const TG_GROUP_BATCH_KEY_PREFIX = 'tg-group:batch:';
// Safety TTL on the buffer key — if the flush cron is down, a stale buffer
// self-expires instead of growing without bound.
export const TG_GROUP_DIGEST_BUFFER_TTL_SECONDS = 26 * 60 * 60;
// Per-section cap in the digest message — extra items collapse to "+N ta".
export const TG_GROUP_DIGEST_MAX_ITEMS = 30;

// Broadcast thresholds
// At/above this a payment is broadcast to the digest (small cash/transfer
// payments below it are left to the daily report).
export const LARGE_PAYMENT_THRESHOLD_SUM = 500_000;
// At/above this a payment is "juda yirik" — sent to the group instantly
// instead of waiting for the next digest flush.
export const INSTANT_PAYMENT_THRESHOLD_SUM = 5_000_000;

// Reply messages (Uzbek)
export const MSG_NOT_APPROVED =
  'Bu guruh hali tasdiqlanmagan. CEO admin paneldan tasdiqlashi kerak.';
export const MSG_NOT_GROUP_CHAT =
  'Bu bot faqat tasdiqlangan Telegram guruhlarida ishlaydi.';
export const MSG_PENDING_REGISTERED = (chatId: number) =>
  `👋 Salom! Bu guruh hali ulanmagan.\n\n` +
  `<b>Guruh ID:</b> <code>${chatId}</code>\n\n` +
  `CEO admin paneldan "Telegram Guruhlar" bo'limiga o'tib, ushbu guruhni tasdiqlasin. ` +
  `Tasdiqlangach barcha komandalar shu yerda ishlay boshlaydi.`;
export const MSG_APPROVED_ANNOUNCE = (
  companyName: string,
  approverName: string,
) =>
  `✅ Bu guruh <b>${companyName}</b> uchun tasdiqlandi (${approverName} tomonidan).\n\n` +
  `Buyruqlar ro'yxati: /help`;
export const MSG_HELP = [
  '📘 <b>DaF admin bot</b> — guruh komandalari:',
  '',
  '/stats — Umumiy statistika',
  "/oquvchilar — O'quvchilar soni va bugun yangi",
  "/oqituvchilar — O'qituvchilar soni",
  "/tolovlar — Bu oylik to'lovlar",
  "/qarzdorlar — Qarzdorlar ro'yxati",
  "/hisobot — Kunlik to'liq hisobot",
  '/guruhlar — Faol guruhlar',
  '/status — Ulanish holati',
  '/unlink — Botni guruhdan uzish (CEO yoki guruh admini)',
].join('\n');

// Feature announcement templates (Phase 4)
export type AnnouncementTemplateKey =
  | 'NEW_PAYMENT_METHOD'
  | 'NEW_REPORT'
  | 'BUG_FIX'
  | 'GENERAL';

export const ANNOUNCEMENT_TEMPLATES: Record<AnnouncementTemplateKey, string> = {
  NEW_PAYMENT_METHOD:
    "🎉 Yangi to'lov usuli: {{name}}\n\nEndi siz {{name}} orqali ham to'lovlarni qabul qila olasiz. Tafsilotlar admin panelda.",
  NEW_REPORT:
    '📊 Yangi hisobot: "{{name}}"\n\n{{description}}\n\nKo\'rish: admin.dafzentrum.uz/reports',
  BUG_FIX:
    "🛠 Tuzatildi: {{summary}}\n\nEndi tizim to'g'ri ishlamoqda. Foydalanish davom etishi mumkin.",
  GENERAL: '✨ Yangilik: {{title}}\n\n{{body}}',
};
