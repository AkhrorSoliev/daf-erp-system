import type {
  Allocation,
  CoursePaymentModel,
  Day,
  DueRef,
  ModelChange,
  MonthKey,
  SharpReason,
  StatementEnrollment,
  StatementModel,
  StatementMonth,
  StatementRow,
} from './statement.types';
import {
  DEFAULT_PACK_SIZE,
  monthOf,
  type MonthSwitchFacts,
} from './statement-months';

/** A month is "sharply different" past both of these (CEO, 26.09.2026). */
const SHARP_MIN_SOM = 50_000;
const SHARP_MIN_SHARE = 0.2;
/** Per-lesson prices closer than this are rounding, not a change. */
const PRICE_NOISE = 500;

interface Due {
  ref: DueRef;
  day: Day;
  left: number;
}

const total = (parts: Array<{ cost: number; lessons: number }>) => ({
  cost: parts.reduce((s, p) => s + p.cost, 0),
  lessons: parts.reduce((s, p) => s + p.lessons, 0),
});

/** FIFO: payments and credits, by date, pay the oldest unpaid lessons first. */
export function allocate(
  months: StatementMonth[],
  payments: StatementRow[],
  prepaidAhead: number,
): {
  allocations: Allocation[];
  unpaid: Array<{ due: DueRef; amount: number }>;
} {
  const dues: Due[] = [];
  for (const m of months) {
    if (m.cost > 0) {
      dues.push({
        ref: { kind: 'month', month: m.key },
        day: `${m.key}-01`,
        left: m.cost,
      });
    }
    for (const it of m.items) {
      if (it.amount < 0) {
        dues.push({
          ref: { kind: 'item', itemKind: it.kind, day: it.day },
          day: it.day,
          left: -it.amount,
        });
      }
    }
  }
  dues.sort((x, y) => x.day.localeCompare(y.day));
  if (prepaidAhead > 0) {
    dues.push({
      ref: { kind: 'prepaid' },
      day: '9999-12-31',
      left: prepaidAhead,
    });
  }

  const sources = [
    ...payments.map((p) => ({
      day: p.day,
      at: p.at,
      kind: 'payment' as const,
      method: p.paymentMethod,
      itemKind: null,
      paymentId: p.paymentId,
      amount: p.amount,
    })),
    ...months.flatMap((m) =>
      m.items
        .filter((i) => i.amount > 0)
        .map((i) => ({
          day: i.day,
          at: null,
          kind: 'credit' as const,
          method: null,
          itemKind: i.kind,
          paymentId: null,
          amount: i.amount,
        })),
    ),
  ].sort((x, y) => x.day.localeCompare(y.day));

  const allocations = sources.map((s): Allocation => {
    let money = s.amount;
    const to: Allocation['to'] = [];
    for (const d of dues) {
      if (money <= 0) break;
      if (d.left <= 0) continue;
      const take = Math.min(money, d.left);
      d.left -= take;
      money -= take;
      to.push({ due: d.ref, amount: take });
    }
    return { ...s, to, leftover: money };
  });

  const unpaid = dues
    .filter((d) => d.left > 0)
    .map((d) => ({ due: d.ref, amount: d.left }))
    .reverse();
  return { allocations, unpaid };
}

export function headlineOf(
  balance: number,
  unpaid: Array<{ due: DueRef; amount: number }>,
): StatementModel['headline'] {
  if (balance < 0) return { kind: 'debt', amount: -balance, unpaid };
  if (balance > 0) return { kind: 'credit', amount: balance, unpaid: [] };
  return { kind: 'zero', amount: 0, unpaid: [] };
}

const perLessonOf = (m: StatementMonth): number =>
  m.monthlyParts[0]?.perLesson ||
  (m.lessons > 0 ? Math.round(m.cost / m.lessons) : 0);

function sharpReasons(
  m: StatementMonth,
  prev: StatementMonth,
  enrollments: StatementEnrollment[],
): SharpReason[] {
  const out: SharpReason[] = [];
  if (m.lessons !== prev.lessons) {
    out.push({ kind: 'lessons', now: m.lessons, before: prev.lessons });
  }
  const now = perLessonOf(m);
  const before = perLessonOf(prev);
  if (now > 0 && before > 0 && Math.abs(now - before) >= PRICE_NOISE) {
    out.push({ kind: 'price', now, before });
  }
  const inMonth = (d: Day | null): d is Day =>
    d !== null && monthOf(d) === m.key;
  for (const e of enrollments) {
    if (!inMonth(e.end) || e.end === e.start) continue;
    // Taken out and put back into the same group that day: not a departure.
    if (
      enrollments.some(
        (o) => o !== e && o.group === e.group && o.start === e.end,
      )
    )
      continue;
    out.push({
      kind: 'left',
      day: e.end,
      group: e.group,
      frozen: e.status === 'FROZEN',
    });
  }
  for (const e of enrollments) {
    if (!inMonth(e.start) || e.end === e.start) continue;
    if (
      enrollments.some(
        (o) => o !== e && o.group === e.group && o.end === e.start,
      )
    )
      continue;
    const ended = enrollments.filter(
      (o) => o !== e && o.end !== null && o.end < e.start,
    );
    const heldMeanwhile = enrollments.some(
      (o) =>
        o !== e && o.start < e.start && (o.end === null || o.end >= e.start),
    );
    const awaySince =
      ended.length > 0 && !ended.some((o) => inMonth(o.end)) && !heldMeanwhile
        ? (ended
            .map((o) => o.end as Day)
            .sort()
            .pop() ?? null)
        : null;
    out.push({ kind: 'joined', day: e.start, group: e.group, awaySince });
  }
  if (m.model && prev.model && m.model !== prev.model) {
    out.push({ kind: 'model', to: m.model });
  }
  return out;
}

/** Flags the latest month when it is sharply different from the last month with lessons. */
export function markSharpChange(
  months: StatementMonth[],
  enrollments: StatementEnrollment[],
): void {
  const last = months[months.length - 1];
  if (!last) return;
  const prev = [...months.slice(0, -1)].reverse().find((m) => m.lessons > 0);
  if (!prev || prev.cost <= 0) return;
  const diff = last.cost - prev.cost;
  if (
    Math.abs(diff) < SHARP_MIN_SOM ||
    Math.abs(diff) / prev.cost < SHARP_MIN_SHARE
  )
    return;
  last.sharp = {
    vs: prev.key,
    diff,
    reasons: sharpReasons(last, prev, enrollments),
  };
}

/**
 * The months where the payment model changed, read from the charges
 * themselves: a month with monthly charges after package months (or with
 * old-way charges the switch reversed), or package months after monthly ones.
 */
export function modelChangesOf(
  months: StatementMonth[],
  facts: Map<MonthKey, MonthSwitchFacts>,
  enrollments: StatementEnrollment[],
): ModelChange[] {
  const changes: ModelChange[] = [];
  let prevModel: CoursePaymentModel | null = null;
  for (const m of months) {
    if (!m.model) continue;
    const f = facts.get(m.key) ?? {
      oldCharged: 0,
      carriedIn: { lessons: 0, amount: 0 },
    };
    const switched = prevModel !== null && m.model !== prevModel;
    const migrated =
      m.model === 'MONTHLY' &&
      f.oldCharged > 0 &&
      !changes.some((c) => c.to === 'MONTHLY');
    if (switched || migrated) {
      const monthlyGroups = new Set(m.monthlyParts.map((p) => p.group));
      const now =
        m.model === 'MONTHLY' ? total(m.monthlyParts) : total(m.packParts);
      changes.push({
        month: m.key,
        to: m.model,
        oldCharged: f.oldCharged,
        newCharged: now.cost,
        newLessons: now.lessons,
        carriedIn: f.carriedIn.lessons > 0 ? { ...f.carriedIn } : null,
        otherGroupPack:
          m.model !== 'MONTHLY'
            ? []
            : m.packParts
                .filter((p) => p.lessons > 0 && !monthlyGroups.has(p.group))
                .map((p) => ({
                  group: p.group,
                  days: p.days,
                  cost: p.cost,
                  leftDay:
                    enrollments
                      .filter(
                        (e) =>
                          e.group === p.group &&
                          e.end !== null &&
                          monthOf(e.end) === m.key,
                      )
                      .map((e) => e.end as Day)
                      .sort()
                      .pop() ?? null,
                })),
      });
    }
    prevModel = m.model;
  }
  return changes;
}

export function packEraOf(
  months: StatementMonth[],
  packSize: number | null,
): StatementModel['packEra'] {
  const packMonths = months.filter((m) => m.model === 'LESSON_PACK');
  if (packMonths.length === 0) return null;
  const lastPack = packMonths[packMonths.length - 1].key;
  const until =
    months.find((m) => m.key > lastPack && m.model === 'MONTHLY')?.key ?? null;
  return { size: packSize ?? DEFAULT_PACK_SIZE, until };
}
