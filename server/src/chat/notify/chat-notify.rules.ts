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

/** Who wrote and how many, nothing else: the messages stay in the chat. */
export function noticeText(senderName: string, count = 1): string {
  const name = `<b>${escapeHtml(senderName)}</b>`;
  return count > 1
    ? `${name} sizga <b>${count} ta</b> yangi xabar yubordi.`
    : `${name} sizga yangi xabar yubordi.`;
}

/** A recipient who read this recently is in the chat: no notice for them. */
export const NOTICE_ACTIVE_MS = 2 * 60 * 1000;
/** Inside this window after a notice, a new stretch edits it instead of ringing again. */
export const NOTICE_COOLDOWN_MS = 10 * 60 * 1000;

export type NoticePlan =
  /** Nothing to do. */
  | 'SKIP'
  /** The unread stretch goes on: edit the one notice to the new count. */
  | 'EDIT_COUNT'
  /** A new stretch soon after a notice: edit it back to one message, no ring. */
  | 'EDIT_RESET'
  /** Send a new notice (and take the old one away). */
  | 'SEND';

/**
 * One notice per unread stretch, edited as messages arrive. A notice from
 * before this rule has no message id and stays a single notice.
 */
export function planNotice(
  state: { notifiedAt: Date | null; telegramMessageId: number | null } | null,
  lastReadAt: Date | null,
  now: Date,
): NoticePlan {
  if (!needsTelegram(state, lastReadAt)) {
    return state?.telegramMessageId ? 'EDIT_COUNT' : 'SKIP';
  }
  if (lastReadAt && now.getTime() - lastReadAt.getTime() < NOTICE_ACTIVE_MS) {
    return 'SKIP';
  }
  if (
    state?.telegramMessageId &&
    state.notifiedAt &&
    now.getTime() - state.notifiedAt.getTime() < NOTICE_COOLDOWN_MS
  ) {
    return 'EDIT_RESET';
  }
  return 'SEND';
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
