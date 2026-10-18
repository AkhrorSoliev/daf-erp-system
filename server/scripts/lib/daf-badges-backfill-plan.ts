/**
 * Pure planner for the one-time badge backfill (spec S2 2.4). The script
 * only reads, calls this, and hands the plan to `grantBadges`.
 */
import { addDaysToDateStr } from '../../src/common/date/tashkent';
import {
  NISHON_KATALOGI,
  type NishonSharoiti,
  shartBajarilganlar,
} from '../../src/daf/nishon/nishon-katalogi';

/**
 * The longest run of consecutive days, and for every length 1..longest the
 * first day a run reached it. Days are Tashkent `YYYY-MM-DD`, any order,
 * repeats allowed.
 */
export function seriyaTarixi(tage: string[]): {
  engUzun: number;
  yetganKun: Map<number, string>;
} {
  const kunlar = [...new Set(tage)].sort();
  const yetganKun = new Map<number, string>();
  let engUzun = 0;
  let joriy = 0;
  let oldingi: string | null = null;
  for (const kun of kunlar) {
    joriy =
      oldingi !== null && addDaysToDateStr(oldingi, 1) === kun ? joriy + 1 : 1;
    if (!yetganKun.has(joriy)) yetganKun.set(joriy, kun);
    engUzun = Math.max(engUzun, joriy);
    oldingi = kun;
  }
  return { engUzun, yetganKun };
}

export interface OquvchiHolati {
  studentId: number;
  companyId: number;
  /** Days with at least one attempt. */
  tage: string[];
  /** Words answered correctly at least once. */
  woerter: number;
  /** Keys already in DafStudentBadge. */
  olingan: Set<string>;
}

export interface BerishRejasi {
  studentId: number;
  companyId: number;
  /** `serie` = the LONGEST historical run: a broken streak earned its badges too. */
  sharoit: NishonSharoiti;
  earnedAt: Record<string, Date>;
  /** Keys this run will add (catalogue order). */
  yangi: string[];
}

/** Noon in Tashkent (07:00 UTC): the same calendar day in both zones. */
function kunOrtasi(kun: string): Date {
  return new Date(`${kun}T07:00:00.000Z`);
}

export function berishRejasi(
  o: OquvchiHolati,
  hozir: Date,
): BerishRejasi | null {
  const { engUzun, yetganKun } = seriyaTarixi(o.tage);
  const sharoit = { serie: engUzun, woerter: o.woerter };
  const yangi = shartBajarilganlar(sharoit).filter((k) => !o.olingan.has(k));
  if (yangi.length === 0) return null;
  const earnedAt: Record<string, Date> = {};
  for (const n of NISHON_KATALOGI) {
    if (!yangi.includes(n.key)) continue;
    earnedAt[n.key] =
      n.tur === 'SERIE' ? kunOrtasi(yetganKun.get(n.chegara)!) : hozir;
  }
  return {
    studentId: o.studentId,
    companyId: o.companyId,
    sharoit,
    earnedAt,
    yangi,
  };
}
