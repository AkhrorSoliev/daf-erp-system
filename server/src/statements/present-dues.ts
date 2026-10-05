import { capitalize, dm, monthName, som } from './statement-text';
import type { Day, DueRef, ItemKind, StatementModel } from './statement.types';

export type Tone = 'red' | 'green' | 'muted';

/**
 * One row of the PDF's table: what was charged, what the student's payments
 * covered of it, what is still owed. A month, a charge that is not a lesson
 * (a refund paid out, a mock exam), or package lessons paid ahead.
 */
export interface DueView {
  label: string;
  /** The label needs the lessons column too (it is not a month). */
  wide: boolean;
  bold: boolean;
  /** The month, for a month's row. */
  key: string | null;
  lessons: string;
  lessonsNote: string | null;
  cost: string | null;
  costNote: string | null;
  paid: string;
  left: string;
  leftTone: Tone;
  details: string[];
  highlight: boolean;
}

export interface DuesTotalView {
  cost: string;
  paid: string;
  left: string;
  leftTone: Tone;
  /** What closed charges without being a payment: a write-off, a discount. */
  details: string[];
}

export interface Settled {
  paid: string;
  left: string;
  leftTone: Tone;
  /** One line per credit that closed part of this charge. */
  coverage: string[];
}

const keyOf = (due: DueRef): string =>
  due.kind === 'month'
    ? due.month
    : due.kind === 'item'
      ? `${due.itemKind}|${due.day}`
      : 'prepaid';

/**
 * Reads the model's own FIFO allocation back per charge, so the table can
 * never disagree with the answer box or with "where each payment went".
 * Payments and credits are kept apart: a debt that was written off is closed,
 * not paid.
 */
export function dueLedger(
  model: StatementModel,
  itemLabel: (kind: ItemKind) => string,
) {
  const paidOf = new Map<string, number>();
  const creditsOf = new Map<
    string,
    Array<{ label: string; day: Day | null; amount: number }>
  >();
  for (const a of model.allocations) {
    for (const t of a.to) {
      const key = keyOf(t.due);
      if (a.kind === 'payment') {
        paidOf.set(key, (paidOf.get(key) ?? 0) + t.amount);
      } else {
        // A negative month (ADR-0073) is named by its month, not a day.
        const credit = a.month
          ? {
              label: `${monthName(a.month)}da qaytarilgan dars puli`,
              day: null,
            }
          : { label: itemLabel(a.itemKind ?? 'correction'), day: a.day };
        creditsOf.set(key, [
          ...(creditsOf.get(key) ?? []),
          { ...credit, amount: t.amount },
        ]);
      }
    }
  }

  const sums = { cost: 0, paid: 0, left: 0 };
  const credited = new Map<string, number>();

  const settle = (key: string, cost: number): Settled => {
    const paid = paidOf.get(key) ?? 0;
    const credits = creditsOf.get(key) ?? [];
    const left = cost - paid - credits.reduce((s, c) => s + c.amount, 0);
    sums.cost += cost;
    sums.paid += paid;
    sums.left += left;
    for (const c of credits) {
      credited.set(c.label, (credited.get(c.label) ?? 0) + c.amount);
    }
    return {
      paid: som(paid),
      left: left > 0 ? som(left) : "yo'q",
      leftTone: left > 0 ? 'red' : 'green',
      coverage: credits.map(
        (c) =>
          `${som(c.amount)} — ${c.label}` + (c.day ? ` (${dm(c.day)})` : ''),
      ),
    };
  };

  /** Charges that are not a month's lessons, after the months. */
  const extraRows = (): DueView[] => {
    const items = new Map<string, { label: string; cost: number }>();
    for (const m of model.months) {
      for (const it of m.items) {
        if (it.amount >= 0) continue;
        const key = `${it.kind}|${it.day}`;
        const found = items.get(key) ?? {
          label: `${capitalize(itemLabel(it.kind))} (${dm(it.day)})`,
          cost: 0,
        };
        found.cost -= it.amount;
        items.set(key, found);
      }
    }
    const rows = [...items].map(([key, it]) => ({ key, ...it }));
    if (model.equation.prepaidAhead > 0) {
      rows.push({
        key: 'prepaid',
        label: "Oldindan to'langan, hali o'tilmagan darslar",
        cost: model.equation.prepaidAhead,
      });
    }
    return rows.map((r): DueView => {
      const s = settle(r.key, r.cost);
      return {
        key: null,
        label: r.label,
        wide: true,
        bold: false,
        lessons: '',
        lessonsNote: null,
        cost: som(r.cost),
        costNote: null,
        paid: s.paid,
        left: s.left,
        leftTone: s.leftTone,
        details: s.coverage,
        highlight: false,
      };
    });
  };

  /** Null unless the rows add up to exactly the debt the answer box states. */
  const total = (): DuesTotalView | null => {
    const debt = model.headline.kind === 'debt' ? model.headline.amount : 0;
    if (sums.cost <= 0 || sums.left !== debt) return null;
    return {
      cost: som(sums.cost),
      paid: som(sums.paid),
      left: sums.left > 0 ? som(sums.left) : "yo'q",
      leftTone: sums.left > 0 ? 'red' : 'green',
      details: [...credited].map(
        ([label, amount]) => `${som(amount)} — ${label}`,
      ),
    };
  };

  return { settle, extraRows, total };
}
