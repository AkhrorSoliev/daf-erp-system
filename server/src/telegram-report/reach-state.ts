import { unreachableReason } from '../telegram/utils/student-chat-reach';
import type { DeliverResult } from './personal-report.service';

export type ReachState = 'BLOCKED' | 'UNLINKED' | 'DELIVERED' | 'LINKED';

/** What the CEO sees for one recipient (ADR-0097). Order of the checks matters. */
export function reachOf(i: {
  linked: boolean;
  disconnectedAt: Date | null;
  lastAttemptOk: boolean | null;
}): ReachState {
  if (!i.linked) return 'UNLINKED';
  if (i.disconnectedAt) return 'BLOCKED';
  return i.lastAttemptOk === true ? 'DELIVERED' : 'LINKED';
}

/** Why an attempt failed, in the CEO's words; null when it succeeded. */
export function attemptNote(r: DeliverResult): string | null {
  if (r.ok) return null;
  if (r.reason === 'SEND_FAILED') {
    if (r.kind === 'permanent') return unreachableReason(r.description);
    if (r.kind === 'transient') return 'Telegram vaqtincha javob bermadi';
    return "Xabarni yuborib bo'lmadi";
  }
  if (r.reason === 'NO_CHAT') return 'Telegram ulanmagan';
  if (r.reason === 'NO_BRANCH') return 'Filial tanlanmagan';
  return 'Bot ishlamayapti';
}
