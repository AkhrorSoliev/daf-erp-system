import { buildMonths } from './statement-months';
import {
  allocate,
  headlineOf,
  markSharpChange,
  modelChangesOf,
  packEraOf,
} from './statement-analysis';
import type {
  ItemKind,
  StatementInput,
  StatementModel,
} from './statement.types';

/** The whole statement: pure, so the PDF, the admin tab and the bot tell one story. */
export function buildStatement(input: StatementInput): StatementModel {
  const r = buildMonths(input);
  markSharpChange(r.months, input.enrollments);
  const { allocations, unpaid } = allocate(
    r.months,
    r.payments,
    r.prepaidAhead,
  );

  const itemTotals = new Map<ItemKind, number>();
  for (const m of r.months) {
    for (const it of m.items) {
      itemTotals.set(it.kind, (itemTotals.get(it.kind) ?? 0) + it.amount);
    }
  }
  const current = input.enrollments.filter(
    (e) => e.status === 'ACTIVE' && !e.deleted,
  );
  const main =
    current[0] ?? input.enrollments[input.enrollments.length - 1] ?? null;

  return {
    asOf: input.asOf,
    student: {
      id: input.student.id,
      name: input.student.name,
      firstName: input.student.firstName,
      lastName: input.student.lastName,
      groups: [
        ...new Set(
          (current.length > 0 ? current : main ? [main] : []).map(
            (e) => e.group,
          ),
        ),
      ],
      course: main ? { ...main.course } : null,
      discountPercent: input.student.discountPercent,
      branch: main?.branch ?? null,
    },
    balance: input.student.balance,
    headline: headlineOf(input.student.balance, unpaid),
    equation: {
      paid: r.paid,
      items: [...itemTotals]
        .filter(([, amount]) => amount !== 0)
        .map(([kind, amount]) => ({ kind, amount })),
      lessons: r.months.reduce((s, m) => s + m.cost, 0),
      prepaidAhead: r.prepaidAhead,
      unexplained: r.unexplained,
      balance: input.student.balance,
    },
    packEra: packEraOf(r.months, r.packSize),
    months: r.months,
    modelChanges: modelChangesOf(r.months, r.switchFacts, input.enrollments),
    allocations,
  };
}
