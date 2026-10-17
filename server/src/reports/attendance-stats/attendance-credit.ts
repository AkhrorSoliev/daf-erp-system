import { applyDiscount } from '../../billing/monthly-price';
import { groupOf, inWindow } from './attendance-counts';
import type {
  AttRow,
  ChargeFact,
  CreditResult,
  CreditSetting,
  DayWindow,
  GroupFact,
} from './attendance-stats.types';

const OFF: CreditSetting = { enabled: false, cap: null };
const keyOf = (studentId: number, groupId: string, month: string) =>
  `${studentId}|${groupId}|${month}`;

/** The «Sababli» marks the money block reads: in the window, not centre-cancelled, in a monthly course's group. */
export function excusedMonthly(
  rows: readonly AttRow[],
  w: DayWindow,
  groups: ReadonlyMap<string, GroupFact>,
): AttRow[] {
  return rows.filter(
    (r) =>
      r.status === 'EXCUSED' &&
      !r.cancelled &&
      inWindow(r.date, w) &&
      groupOf(groups, r.groupId).monthly,
  );
}

/**
 * «Keyingi oy to'lovidan taxminan X chegiriladi» (spec B7c §4.3). Per
 * (student, group, month): min(excused, the branch's monthly cap) × the
 * month's CHARGED per-lesson price after the frozen discount. An estimate: the
 * exact figure is the next month's `creditAmount`. The rule itself belongs to
 * billing (`MonthlyChargeService`); this only shows it.
 */
export function excusedCredit(
  excused: readonly AttRow[],
  groups: ReadonlyMap<string, GroupFact>,
  charges: readonly ChargeFact[],
  settings: ReadonlyMap<number, CreditSetting>,
): CreditResult {
  const chargeBy = new Map(
    charges.map((c) => [keyOf(c.studentId, c.groupId, c.month), c]),
  );
  const perKey = new Map<string, { n: number; branchId: number }>();
  for (const r of excused) {
    const k = keyOf(r.studentId, r.groupId, r.date.slice(0, 7));
    const e = perKey.get(k) ?? {
      n: 0,
      branchId: groupOf(groups, r.groupId).branchId,
    };
    e.n++;
    perKey.set(k, e);
  }
  let amount = 0;
  let uncharged = 0;
  let anyOn = false;
  for (const [k, e] of perKey) {
    const s = settings.get(e.branchId) ?? OFF;
    if (s.enabled) anyOn = true;
    const charge = chargeBy.get(k);
    if (!charge) {
      uncharged += e.n;
      continue;
    }
    if (!s.enabled) continue;
    amount +=
      Math.min(e.n, s.cap ?? e.n) *
      applyDiscount(charge.perLessonCost, charge.discountPercent);
  }
  const enabled = perKey.size === 0 || anyOn;
  return {
    lessons: excused.length,
    students: new Set(excused.map((r) => r.studentId)).size,
    amount: enabled ? amount : null,
    enabled,
    uncharged,
  };
}
