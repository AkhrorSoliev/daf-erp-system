import type { BalanceNoticeChannel } from '@prisma/client';
import { addBankDays, REFUND_TERM_BANK_DAYS } from '../common/date/bank-days';
import { addDaysToDateStr, tashkentDateStr } from '../common/date/tashkent';
import { dm } from '../statements/statement-text';

/**
 * «Markaz hisobiga o'tkazish» opens only after the student was told (ADR-0076):
 * the notice starts the 10-bank-day refund term, then the contract's 30 days.
 * Pure — `loadTransferState` reads the notice and the holidays.
 */
export const TRANSFER_WAIT_DAYS = 30;

/** A notice as the page shows it: the Tashkent day and the channel. */
export interface NoticeCell {
  date: string;
  channel: BalanceNoticeChannel;
}

export interface TransferState {
  /** The latest valid notice. */
  notice: NoticeCell | null;
  /** notice + 10 bank days. */
  termEnds: string | null;
  /** termEnds + 30 calendar days — the first day a withdrawal is allowed. */
  allowedFrom: string | null;
  allowed: boolean;
  /** The exact 400 `POST /withdrawals` answers; null when allowed. */
  refusal: string | null;
}

export const NO_NOTICE_REFUSAL =
  "Avval o'quvchiga xabar bering. Markazga o'tkazish xabardan 10 bank kuni va yana 30 kun o'tgach ochiladi.";

/**
 * A notice counts only if it was given in the student's current state
 * (`createdAt ≥ statusChangedAt`): one given before the student came back and
 * left again does not. `latest` is the student's newest notice — when it does
 * not count, no older one can.
 */
export function latestValidNotice(
  latest: { createdAt: Date; channel: BalanceNoticeChannel } | null,
  statusChangedAt: Date | null,
): NoticeCell | null {
  if (!latest) return null;
  if (statusChangedAt && latest.createdAt < statusChangedAt) return null;
  return { date: tashkentDateStr(latest.createdAt), channel: latest.channel };
}

/** The spec's `transferAllowedFrom`: notice + 10 bank days + 30 days. */
export function transferTerm(
  noticeDay: string,
  holidays: ReadonlySet<string>,
): { termEnds: string; allowedFrom: string } {
  const termEnds = addBankDays(noticeDay, REFUND_TERM_BANK_DAYS, holidays);
  return {
    termEnds,
    allowedFrom: addDaysToDateStr(termEnds, TRANSFER_WAIT_DAYS),
  };
}

export function transferState(
  notice: NoticeCell | null,
  holidays: ReadonlySet<string>,
  today: string,
): TransferState {
  if (!notice) {
    return {
      notice: null,
      termEnds: null,
      allowedFrom: null,
      allowed: false,
      refusal: NO_NOTICE_REFUSAL,
    };
  }
  const { termEnds, allowedFrom } = transferTerm(notice.date, holidays);
  const allowed = today >= allowedFrom;
  return {
    notice,
    termEnds,
    allowedFrom,
    allowed,
    refusal: allowed
      ? null
      : `Markazga o'tkazish ${dm(allowedFrom)} dan ochiladi (xabar ${dm(notice.date)} da berilgan, qaytarish muddati ${dm(termEnds)} gacha).`,
  };
}
