import { BadRequestException } from '@nestjs/common';
import { tashkentMonthKey } from '../common/date/tashkent';

/** The report starts with the reporting base (ADR-0067): no month before it. */
export const GATE_FIRST_MONTH = '2026-05';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?month=` → a month key inside [2026-05, the current Tashkent month]. Empty is the current month. */
export function parseGateMonth(month: string | undefined, now: Date): string {
  const current = tashkentMonthKey(now);
  if (!month) return current;
  if (!MONTH.test(month)) {
    throw new BadRequestException("Oy YYYY-MM ko'rinishida bo'lishi kerak");
  }
  if (month < GATE_FIRST_MONTH) {
    throw new BadRequestException('Bot hisoboti may 2026 dan boshlanadi');
  }
  if (month > current) {
    throw new BadRequestException("Kelajak oyni tanlab bo'lmaydi");
  }
  return month;
}

/** Where a person the bot stopped stands now (ADR-0104). */
export type GateState = 'waiting' | 'joined' | 'left';

export interface GateRowTimes {
  blockedAt: Date;
  joinedAt: Date | null;
  leftAt: Date | null;
}

/**
 * The ONE reading of a gate row. `joinedAt` is the FIRST join and
 * `recordJoined` only clears `leftAt` on a return, so a member who left,
 * was blocked and came back has `joinedAt < blockedAt` and no `leftAt`.
 */
export function classifyGateRow(row: GateRowTimes): GateState {
  if (!row.joinedAt) return 'waiting';
  if (row.leftAt) return row.joinedAt >= row.blockedAt ? 'left' : 'waiting';
  return 'joined';
}

/** Rows the gate actually stopped (`blockedAt` set), with the type narrowed. */
export function withBlocked<T extends { blockedAt: Date | null }>(
  rows: readonly T[],
): (T & { blockedAt: Date })[] {
  return rows.filter((r): r is T & { blockedAt: Date } => r.blockedAt !== null);
}

export interface CohortFigures {
  blocked: number;
  joined: number;
  left: number;
  conversionRate: number;
}

/** The three cards of one month's cohort. `joined` includes the ones who left later, so `joined <= blocked`. */
export function cohortFigures(rows: readonly GateRowTimes[]): CohortFigures {
  let joined = 0;
  let left = 0;
  for (const r of rows) {
    const state = classifyGateRow(r);
    if (state === 'left') {
      left++;
      joined++;
    } else if (state === 'joined') {
      joined++;
    }
  }
  const blocked = rows.length;
  return {
    blocked,
    joined,
    left,
    conversionRate: blocked > 0 ? Math.round((joined / blocked) * 100) : 0,
  };
}

/** «Hali a'zo bo'lmagan»: stopped and not in the channel now. */
export function waitingNow(rows: readonly GateRowTimes[]): number {
  return rows.filter((r) => classifyGateRow(r) === 'waiting').length;
}
