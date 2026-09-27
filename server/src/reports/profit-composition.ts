/**
 * Pure pieces of the Foyda card's breakdown («Foyda tarkibi»). No database
 * access here, so each rule can be tested on its own; the service feeds them
 * rows it has already loaded.
 */

const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export interface MonthStatus {
  /** True while the month is still running in Tashkent. */
  isOpen: boolean;
  /** Days of the month already started, today included (0 for a future month). */
  daysPassed: number;
  daysInMonth: number;
  /** Today in Tashkent, 'YYYY-MM-DD'. */
  todayStr: string;
}

/** Where `month` ('YYYY-MM') stands relative to `now` in Tashkent. */
export function monthStatus(month: string, now: Date): MonthStatus {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const t = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const todayStr = t.toISOString().slice(0, 10);
  const todayMonth = todayStr.slice(0, 7);
  if (todayMonth < month) {
    return { isOpen: false, daysPassed: 0, daysInMonth, todayStr };
  }
  if (todayMonth > month) {
    return { isOpen: false, daysPassed: daysInMonth, daysInMonth, todayStr };
  }
  return {
    isOpen: true,
    daysPassed: t.getUTCDate(),
    daysInMonth,
    todayStr,
  };
}

/**
 * The costs that arrive once a month, usually at its end. Their absence in a
 * running month is what makes the mid-month profit look far better than the
 * month will close: on 26.09.2026 September read 69.1 mln with rent, tax and
 * electricity still unrecorded (24 mln in August).
 *
 * Tax is ALSO matched by description under `OTHER`, because that is where the
 * centre records it («Soliqlar», July and August 2026) — the TAXES category
 * exists but was never used.
 */
export type RecurringExpenseKey = 'RENT' | 'UTILITIES' | 'TAXES';

export function recurringKeyOf(expense: {
  category: string;
  description: string | null;
}): RecurringExpenseKey | null {
  if (expense.category === 'RENT') return 'RENT';
  if (expense.category === 'UTILITIES') return 'UTILITIES';
  if (expense.category === 'TAXES') return 'TAXES';
  if (
    expense.category === 'OTHER' &&
    /soliq/i.test(expense.description ?? '')
  ) {
    return 'TAXES';
  }
  return null;
}

export interface ExpenseRow {
  category: string;
  description: string | null;
  amount: number;
  /** 'YYYY-MM-DD' */
  dateStr: string;
}

export interface MissingRecurringExpense {
  key: RecurringExpenseKey;
  /** What last month's pattern says is still to come this month. */
  amount: number;
  /** Last month's total for this key. */
  lastMonthAmount: number;
  /** Day of the month the last of last month's entries was recorded on. */
  lastMonthDay: number;
}

/**
 * Last month's recurring costs that this month has not (fully) recorded yet.
 * Expected = last month's total − what this month already holds, never
 * negative. Only meaningful for a month still running.
 */
export function missingRecurringExpenses(
  lastMonth: ExpenseRow[],
  thisMonth: ExpenseRow[],
): MissingRecurringExpense[] {
  const sum = (rows: ExpenseRow[]) => {
    const out = new Map<RecurringExpenseKey, { amount: number; day: number }>();
    for (const r of rows) {
      const key = recurringKeyOf(r);
      if (!key) continue;
      const cur = out.get(key) ?? { amount: 0, day: 0 };
      cur.amount += r.amount;
      cur.day = Math.max(cur.day, Number(r.dateStr.slice(8, 10)));
      out.set(key, cur);
    }
    return out;
  };
  const last = sum(lastMonth);
  const now = sum(thisMonth);
  const order: RecurringExpenseKey[] = ['RENT', 'TAXES', 'UTILITIES'];
  const out: MissingRecurringExpense[] = [];
  for (const key of order) {
    const l = last.get(key);
    if (!l || l.amount <= 0) continue;
    const missing = l.amount - (now.get(key)?.amount ?? 0);
    if (missing <= 0) continue;
    out.push({
      key,
      amount: missing,
      lastMonthAmount: l.amount,
      lastMonthDay: l.day,
    });
  }
  return out;
}

export interface LessonForDebt {
  studentId: number;
  groupId: string;
  value: number;
}

/**
 * Money counted as this month's revenue that sits with students who no longer
 * study at the centre and owe it: left their group or were frozen, and hold no
 * ACTIVE enrollment anywhere (a student who moved to another group is still
 * studying, and their debt is collected the usual way). Per student: the value
 * of this month's lessons, capped at what they owe today — a student who paid
 * part of it has only the rest outstanding.
 */
export function unpaidLeftLessons(
  lessons: LessonForDebt[],
  studyingStudents: Set<number>,
  debtByStudent: Map<number, number>,
): { students: number; lessons: number; amount: number } {
  const perStudent = new Map<number, { lessons: number; value: number }>();
  for (const l of lessons) {
    if (l.value <= 0) continue;
    if (studyingStudents.has(l.studentId)) continue;
    const cur = perStudent.get(l.studentId) ?? { lessons: 0, value: 0 };
    cur.lessons += 1;
    cur.value += l.value;
    perStudent.set(l.studentId, cur);
  }
  let students = 0;
  let lessonCount = 0;
  let amount = 0;
  for (const [studentId, s] of perStudent) {
    const debt = debtByStudent.get(studentId) ?? 0;
    if (debt <= 0) continue;
    students += 1;
    lessonCount += s.lessons;
    amount += Math.min(debt, s.value);
  }
  return { students, lessons: lessonCount, amount };
}

/** The largest `n` rows, then one row summing the rest. */
export function topWithRest<T extends { amount: number }>(
  rows: T[],
  n: number,
): { top: T[]; rest: { count: number; amount: number } } {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount);
  const top = sorted.slice(0, n);
  const tail = sorted.slice(n);
  return {
    top,
    rest: {
      count: tail.length,
      amount: tail.reduce((s, r) => s + r.amount, 0),
    },
  };
}
