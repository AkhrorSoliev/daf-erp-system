import type { CallOutcome, PaymentMethod } from '@prisma/client';
import { tashkentDateStr } from '../../common/date/tashkent';
import {
  debtTabAmount,
  type DebtKindKey,
  type DebtRow,
  type DebtSplit,
  type DebtTab,
} from '../../reports/debt-split';
import type { StatementModel } from '../../statements/statement.types';

export type PromiseFilter = 'open' | 'broken' | 'none';
export type DebtSort = 'debt' | 'oldest' | 'broken' | 'name';

export interface DebtGroup {
  id: string;
  name: string;
  teachers: { id: number; name: string }[];
}
/** The «Va'da» cell; `promiseDate` is the Tashkent day. */
export interface PromiseCell {
  state: 'open' | 'broken';
  promiseDate: string;
  promisedAmount: number | null;
}

/** One enrollment as the list reads it (newest first). */
export interface EnrollmentFact {
  status: string;
  group: {
    id: string;
    name: string;
    deletedAt: Date | null;
    statusEnum: string;
    teachers: {
      teacher: { id: number; firstName: string; lastName: string };
    }[];
  };
}

/** What the list knows of a row before paging (filters and sort read only this). */
export interface DebtListRow {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  /** This tab's part (`debtTabAmount`). */
  amount: number;
  /** The other studying part, for «+ eski qarz» / «+ shu oy»; 0 in O'qimayotganlar. */
  otherPart: number;
  debt: number;
  kind: DebtKindKey | null;
  /** Studying: live active groups. Not studying: the latest enrollment's group, or none. */
  groups: DebtGroup[];
  promise: PromiseCell | null;
  /** Unpaid debt by origin month (`DebtAgeService`); in Eski qarz only months before the current one. */
  months: { monthKey: string; amount: number }[];
  /** Oldest origin month of the whole debt, for «Eng uzoq qarzdor»; null while undated. */
  oldestMonth: string | null;
}

/** A shown row: plus the facts read for the page (or the Excel) only. */
export interface DebtListItem extends DebtListRow {
  dueDate: string | null;
  lastCall: { createdAt: string; outcome: CallOutcome } | null;
  lastPayment: { createdAt: string; amount: number } | null;
}

export interface DrawerMonth {
  month: string;
  charged: number | null;
  paid: number | null;
  left: number;
}

export interface DebtListResponse {
  data: DebtListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** Σ this tab's part over the filtered rows (every page). */
  sum: number;
  tabs: ReturnType<typeof tabTotals>;
  /** `notStudying.currentMonth` — the Shu oy tab's difference line (spec §2.2). */
  leftThisMonth: number;
  options: ReturnType<typeof filterOptions>;
  /** Write-offs still in force in the scope — «Kechirilgan qarzlar arxivi · N ta». */
  writeOffCount: number;
}

export interface DebtDrawer {
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  kind: DebtKindKey | null;
  groups: DebtGroup[];
  debt: number;
  months: DrawerMonth[];
  lastPayment: {
    createdAt: string;
    amount: number;
    method: PaymentMethod;
  } | null;
  lastCall: {
    createdAt: string;
    outcome: CallOutcome;
    note: string | null;
    calledByName: string;
  } | null;
  promise: PromiseCell | null;
}

/** Spec §2.3 «Guruh / ustoz» and «Oxirgi guruh». `enrollments` newest first. */
export function groupsOf(
  kind: DebtKindKey | null,
  enrollments: readonly EnrollmentFact[],
): DebtGroup[] {
  // `ACTIVE_ENROLLMENT_WHERE` on a loaded row.
  const live = (e: EnrollmentFact) =>
    e.status === 'ACTIVE' &&
    e.group.deletedAt === null &&
    e.group.statusEnum === 'ACTIVE';
  const picked =
    kind === null ? enrollments.filter(live) : enrollments.slice(0, 1);
  return picked.map(({ group: g }) => ({
    id: g.id,
    name: g.name,
    teachers: g.teachers.map(({ teacher: t }) => ({
      id: t.id,
      name: `${t.firstName} ${t.lastName}`.trim(),
    })),
  }));
}

/**
 * Spec §2.3 «Va'da», from the student's latest promise of any month: OPEN with
 * a day ahead → open; BROKEN → broken (every row owes, so the cron's
 * «overdue» meaning holds); otherwise none.
 */
export function promiseCell(
  p: {
    status: string;
    promiseDate: Date;
    promisedAmount: number | null;
  } | null,
  today: string,
): PromiseCell | null {
  if (!p) return null;
  const day = tashkentDateStr(p.promiseDate);
  if (p.status === 'BROKEN')
    return {
      state: 'broken',
      promiseDate: day,
      promisedAmount: p.promisedAmount,
    };
  if (p.status === 'OPEN' && day >= today)
    return {
      state: 'open',
      promiseDate: day,
      promisedAmount: p.promisedAmount,
    };
  return null;
}

export function toListRow(
  row: DebtRow,
  tab: DebtTab,
  f: {
    student: { firstName: string; lastName: string; phone: string | null };
    groups: DebtGroup[];
    promise: PromiseCell | null;
    ageMonths: Record<string, number> | null;
    currentMonth: string;
  },
): DebtListRow {
  const all = Object.entries(f.ageMonths ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, amount]) => ({ monthKey, amount }));
  return {
    studentId: row.studentId,
    firstName: f.student.firstName,
    lastName: f.student.lastName,
    phone: f.student.phone,
    amount: debtTabAmount(row, tab),
    otherPart:
      tab === 'shu-oy' ? row.older : tab === 'eski' ? row.currentMonth : 0,
    debt: row.debt,
    kind: row.kind,
    groups: f.groups,
    promise: f.promise,
    months:
      tab === 'eski' ? all.filter((m) => m.monthKey < f.currentMonth) : all,
    oldestMonth: all[0]?.monthKey ?? null,
  };
}

/** «Ism, telefon yoki ID» — the student list's rule: a name or the phone contains it, or the exact id. */
export function matchesSearch(
  r: Pick<DebtListRow, 'studentId' | 'firstName' | 'lastName' | 'phone'>,
  search: string,
): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    r.firstName.toLowerCase().includes(q) ||
    r.lastName.toLowerCase().includes(q) ||
    (r.phone ?? '').includes(q) ||
    (Number.isInteger(Number(q)) && r.studentId === Number(q))
  );
}

export function filterDebtRows(
  rows: readonly DebtListRow[],
  f: {
    kind?: DebtKindKey;
    groupIds?: string[];
    teacherIds?: number[];
    promise?: PromiseFilter;
    search?: string;
  },
): DebtListRow[] {
  return rows.filter(
    (r) =>
      (!f.kind || r.kind === f.kind) &&
      (!f.groupIds?.length ||
        r.groups.some((g) => f.groupIds!.includes(g.id))) &&
      (!f.teacherIds?.length ||
        r.groups.some((g) =>
          g.teachers.some((t) => f.teacherIds!.includes(t.id)),
        )) &&
      (!f.promise ||
        (f.promise === 'none'
          ? r.promise === null
          : r.promise?.state === f.promise)) &&
      matchesSearch(r, f.search ?? ''),
  );
}

const byAmount = (a: DebtListRow, b: DebtListRow) =>
  b.amount - a.amount || a.studentId - b.studentId;

export function sortDebtRows(
  rows: readonly DebtListRow[],
  sort: DebtSort = 'debt',
): DebtListRow[] {
  const out = [...rows];
  if (sort === 'name') {
    return out.sort(
      (a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ) || a.studentId - b.studentId,
    );
  }
  if (sort === 'oldest') {
    return out.sort((a, b) => {
      // An undated debt sorts last — an unknown age is not the oldest.
      if (a.oldestMonth !== b.oldestMonth) {
        if (a.oldestMonth === null) return 1;
        if (b.oldestMonth === null) return -1;
        return a.oldestMonth < b.oldestMonth ? -1 : 1;
      }
      return byAmount(a, b);
    });
  }
  if (sort === 'broken') {
    return out.sort(
      (a, b) =>
        Number(b.promise?.state === 'broken') -
          Number(a.promise?.state === 'broken') || byAmount(a, b),
    );
  }
  return out.sort(byAmount);
}

/** Guruh and Ustoz options: the tab's own rows, before its filters. */
export function filterOptions(rows: readonly DebtListRow[]) {
  const groups = new Map<string, string>();
  const teachers = new Map<number, string>();
  for (const r of rows) {
    for (const g of r.groups) {
      groups.set(g.id, g.name);
      for (const t of g.teachers) teachers.set(t.id, t.name);
    }
  }
  const byName = <K>(m: Map<K, string>) =>
    [...m]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  return { groups: byName(groups), teachers: byName(teachers) };
}

/** The tab buttons' totals — the split's own fields (Task 1), never re-summed here. */
export function tabTotals(split: DebtSplit) {
  return {
    'shu-oy': {
      total: split.studying.currentMonth,
      count: split.studying.currentMonthCount,
    },
    eski: { total: split.studying.older, count: split.studying.olderCount },
    chiqqan: {
      total: split.notStudying.total,
      count: split.notStudying.count,
      byKind: split.notStudying.byKind,
    },
  };
}

/**
 * The drawer's «Oylar bo'yicha», from the statement's own FIFO allocation
 * (ADR-0037) — never a second calculation. One line per month with debt left:
 * a month's lessons (charged, paid by payments, left), and in the same month
 * any other unpaid charge (a mock fee, a refund paid out) adds to `left`. A
 * month whose debt is only such charges has no `charged`/`paid`.
 */
export function drawerMonths(
  model: Pick<StatementModel, 'asOf' | 'months' | 'allocations' | 'headline'>,
): DrawerMonth[] {
  const lines = new Map<string, DrawerMonth>();
  for (const u of model.headline.unpaid) {
    const month =
      u.due.kind === 'month'
        ? u.due.month
        : u.due.kind === 'item'
          ? u.due.day.slice(0, 7)
          : model.asOf.slice(0, 7);
    const line = lines.get(month) ?? {
      month,
      charged: null,
      paid: null,
      left: 0,
    };
    line.left += u.amount;
    if (u.due.kind === 'month') {
      const key = u.due.month;
      line.charged = model.months.find((m) => m.key === key)?.cost ?? null;
      line.paid = model.allocations
        .filter((a) => a.kind === 'payment')
        .flatMap((a) => a.to)
        .reduce(
          (s, t) =>
            t.due.kind === 'month' && t.due.month === key ? s + t.amount : s,
          0,
        );
    }
    lines.set(month, line);
  }
  return [...lines.values()].sort((a, b) => a.month.localeCompare(b.month));
}
