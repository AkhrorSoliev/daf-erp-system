// Why a message to a student did not go out, as the staff read it.
//
// The server keeps Telegram's own description verbatim (English, and for a
// network error the request URL); the screen shows this instead. The server's
// own two reasons are already Uzbek and pass through.

const FALLBACK = "Xabar yuborilmadi: Telegram xatosi";

const OWN_MESSAGES = new Set([
  "Telegram bog'lanmagan",
  "Telegram bot ishlamayapti",
]);

const KNOWN: [RegExp, string][] = [
  [/bot was blocked/i, "O'quvchi botni bloklagan — xabar yetib bormadi"],
  [
    /user is deactivated/i,
    "O'quvchining Telegram hisobi o'chirilgan — xabar yetib bormadi",
  ],
  [
    /chat not found|PEER_ID_INVALID|can't initiate conversation/i,
    "O'quvchining Telegram chati topilmadi — xabar yetib bormadi",
  ],
  [/Too Many Requests/i, "Telegram band — birozdan keyin qayta yuboring"],
];

export function smsErrorText(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  if (OWN_MESSAGES.has(raw)) return raw;
  for (const [pattern, text] of KNOWN) {
    if (pattern.test(raw)) return text;
  }
  return FALLBACK;
}
