const NIGHT_START = 22;
const DAY_START = 8;

/** Tashkent is UTC+5 with no daylight saving, so the hour is a fixed shift. */
export function isQuietHour(now: Date): boolean {
  const hour = (now.getUTCHours() + 5) % 24;
  return hour >= NIGHT_START || hour < DAY_START;
}

/** False while a notice already went out and the recipient has not read since. */
export function needsTelegram(
  state: { notifiedAt: Date | null } | null,
  lastReadAt: Date | null,
): boolean {
  if (!state?.notifiedAt) return true;
  return lastReadAt !== null && state.notifiedAt <= lastReadAt;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Who wrote, nothing else: the message itself stays in the chat. */
export function noticeText(senderName: string): string {
  return `<b>${escapeHtml(senderName)}</b> sizga yangi xabar yubordi.`;
}

export function chatDeepLink(
  miniAppUrl: string | undefined,
  conversationId: string,
): string | undefined {
  if (!miniAppUrl) return undefined;
  try {
    const url = new URL(miniAppUrl);
    url.searchParams.set('next', `/portal/chat/${conversationId}`);
    return url.toString();
  } catch {
    return undefined;
  }
}
