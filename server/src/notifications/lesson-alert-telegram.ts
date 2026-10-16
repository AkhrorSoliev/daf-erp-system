import { TASHKENT_OFFSET_MS } from '../common/date/tashkent';
import { escapeHtml } from '../telegram-groups/utils/format.util';

/** Why a lesson alert closed (ADR-0090); the Telegram copy's new headline. */
export type LessonOutcome =
  | 'TAKEN'
  | 'CANCELLED'
  | 'MOVED'
  | 'HELD'
  | 'NOT_HELD'
  | 'CLOSED'
  | 'GROUP_DELETED'
  | 'EXPIRED';

const WITH_TIME: Partial<Record<LessonOutcome, string>> = {
  TAKEN: '✅ Davomat olindi',
  CANCELLED: '❌ Dars bekor qilindi',
  MOVED: "🔀 Dars ko'chirildi",
  HELD: "✅ «Bo'ldi» deb belgilandi",
  NOT_HELD: "❌ «Bo'lmadi» deb belgilandi",
};

const WITHOUT_TIME: Partial<Record<LessonOutcome, string>> = {
  CLOSED: '☑️ Savol yopildi',
  GROUP_DELETED: "🗑 Guruh o'chirildi",
  EXPIRED: '☑️ Yopildi',
};

function tashkentHHmm(at: Date): string {
  const t = new Date(at.getTime() + TASHKENT_OFFSET_MS);
  const hh = String(t.getUTCHours()).padStart(2, '0');
  const mm = String(t.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * The edited Telegram text of a resolved lesson alert: the outcome (and the
 * Tashkent time it happened), the lesson details the alert carried (the second
 * `\n\n` block of `message`, as `buildDetailsBlock` wrote it) and the old title.
 * The instruction and the link are dropped: there is nothing left to do.
 */
export function resolvedLessonAlertText(
  n: { title: string; message: string },
  outcome: LessonOutcome,
  at: Date,
): string {
  const head =
    WITHOUT_TIME[outcome] ?? `${WITH_TIME[outcome]} · ${tashkentHHmm(at)}`;
  const details = n.message.split('\n\n')[1];
  return [
    `<b>${head}</b>`,
    details ? `<blockquote>${escapeHtml(details)}</blockquote>` : null,
    `<i>Avvalgi xabar: ${escapeHtml(n.title)}</i>`,
  ]
    .filter((line) => line !== null)
    .join('\n');
}
