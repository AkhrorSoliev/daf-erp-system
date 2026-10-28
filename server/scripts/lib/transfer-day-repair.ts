/**
 * Pure plan for `scripts/repair-transfer-day-double-charge.ts` (ADR-0137).
 *
 * Before ADR-0137 a group change billed the day the student changed groups in
 * BOTH groups: the group he left keeps the day he left, and the new charge
 * started from the same day. A student is in one group at a time, so the day
 * is paid once.
 *
 * Which group keeps it: the one that has the day's attendance (the lesson was
 * held there, and the teacher's pay sits there); with no attendance anywhere,
 * the group he was in first. If two groups both have attendance the case is
 * not decided here and is reported for a person.
 */
import {
  cancelledLessonRelease,
  DepartureRelease,
} from '../../src/billing/departure-release';

export interface RepairCharge {
  id: string;
  enrollmentId: string;
  enrollmentCreatedAt: Date;
  studentId: number;
  groupId: string;
  groupName: string;
  branchId: number;
  periodYear: number;
  periodMonth: number;
  coveredDates: string[];
  frozenOutDates: string[];
  perLessonCost: number;
  discountPercent: number;
  chargedAmount: number;
}

export interface RepairDrop {
  chargeId: string;
  enrollmentId: string;
  studentId: number;
  branchId: number;
  groupName: string;
  period: string; // 'YYYY-MM'
  day: string;
  amount: number;
  keptIn: string; // group name that keeps the day
  keptBecause: 'attendance' | 'first';
}

export interface RepairPlan {
  drops: RepairDrop[];
  /** Days two groups both hold attendance for: left for a person. */
  ambiguous: { studentId: number; day: string; groups: string[] }[];
}

const effective = (c: RepairCharge): string[] => {
  const out = new Set(c.frozenOutDates);
  return c.coveredDates.filter((d) => !out.has(d));
};

/**
 * `attendanceGroups`: `${studentId}|${day}` -> ids of the groups that hold an
 * attendance row of that student on that day.
 */
export function planRepair(
  charges: readonly RepairCharge[],
  attendanceGroups: ReadonlyMap<string, ReadonlySet<string>>,
): RepairPlan {
  const drops: RepairDrop[] = [];
  const ambiguous: RepairPlan['ambiguous'] = [];
  // Running state per charge, so several days of one charge release in turn.
  const state = new Map<string, RepairCharge>(
    charges.map((c) => [c.id, { ...c, frozenOutDates: [...c.frozenOutDates] }]),
  );

  const byMonth = new Map<string, RepairCharge[]>();
  for (const c of charges) {
    const k = `${c.studentId}|${c.periodYear}-${c.periodMonth}`;
    byMonth.set(k, [...(byMonth.get(k) ?? []), c]);
  }

  for (const list of byMonth.values()) {
    const days = new Set<string>();
    for (const c of list) for (const d of effective(c)) days.add(d);
    for (const day of [...days].sort()) {
      const holders = list.filter((c) =>
        effective(state.get(c.id)!).includes(day),
      );
      if (new Set(holders.map((h) => h.groupId)).size < 2) continue;

      const att =
        attendanceGroups.get(`${holders[0].studentId}|${day}`) ??
        new Set<string>();
      const withAtt = [
        ...new Set(
          holders.filter((h) => att.has(h.groupId)).map((h) => h.groupId),
        ),
      ];
      if (withAtt.length > 1) {
        ambiguous.push({
          studentId: holders[0].studentId,
          day,
          groups: holders.map((h) => h.groupName),
        });
        continue;
      }
      const keeper =
        withAtt.length === 1
          ? holders.find((h) => h.groupId === withAtt[0])!
          : [...holders].sort(
              (a, b) => +a.enrollmentCreatedAt - +b.enrollmentCreatedAt,
            )[0];

      for (const h of holders) {
        if (h.groupId === keeper.groupId) continue;
        const cur = state.get(h.id)!;
        const release: DepartureRelease | null = cancelledLessonRelease(
          {
            coveredDates: cur.coveredDates,
            frozenOutDates: cur.frozenOutDates,
            perLessonCost: cur.perLessonCost,
            discountPercent: cur.discountPercent,
            chargedAmount: cur.chargedAmount,
          },
          day,
        );
        if (!release) continue;
        cur.frozenOutDates = release.frozenOutAfter ?? cur.frozenOutDates;
        cur.chargedAmount -= release.amount;
        drops.push({
          chargeId: h.id,
          enrollmentId: h.enrollmentId,
          studentId: h.studentId,
          branchId: h.branchId,
          groupName: h.groupName,
          period: `${h.periodYear}-${String(h.periodMonth).padStart(2, '0')}`,
          day,
          amount: release.amount,
          keptIn: keeper.groupName,
          keptBecause: withAtt.length === 1 ? 'attendance' : 'first',
        });
      }
    }
  }
  return { drops, ambiguous };
}
