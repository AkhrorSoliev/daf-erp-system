import type { Prisma } from '@prisma/client';
import { splitLessonSlices } from '../common/finance/ledger-replay';
import type {
  CoursePaymentModel,
  Day,
  ItemKind,
  LessonDay,
  LessonStatus,
  MonthKey,
  MonthlyPart,
  ReleaseWhy,
  StatementInput,
  StatementItem,
  StatementMonth,
  StatementNote,
  StatementRow,
} from './statement.types';

/** Reversal rows written by the switch to monthly billing (`migrate-to-monthly`). */
export const MIGRATION_REVERSAL = "Oylik to'lovga o'tish migratsiyasi";
/** Lessons paid before the system existed (the April cutover) all fell in April 2026. */
export const PRE_SYSTEM_MONTH: MonthKey = '2026-04';

/** A difference from the balance this small is rounding, not a gap. */
const ROUNDING_TOLERANCE = 100;

/**
 * Untagged refunds written before `metadata.kind` existed, known by their
 * exact texts (every one found in production on 26.09.2026). Match whole
 * phrases, never a single word: a correction that merely mentions a freeze
 * is not a release.
 */
const MONTHLY_RELEASE_TEXT = /o'tmagan (\d+) dars qaytarildi/;
const PREPAID_RELEASE_TEXTS = [
  /qoldiq darslar uchun balans tiklash/i,
  /^O'quvchi muzlatildi$/i,
  /^Muzlatish: \d+ ta dars/i,
  /oldindan to'langan darslar (balansga|puli) qaytarildi/i,
  /qaytarilmagan dars uchun balans tiklash/i,
  /ta oldindan to'langan dars bekor qilindi/i,
  /hisoblagich kamaytirilmagan/i,
];

const ITEM_BY_TYPE: Record<string, ItemKind> = {
  REFUND: 'refund',
  MOCK_EXAM_FEE: 'mock-fee',
  DEBT_WRITE_OFF: 'debt-write-off',
  BALANCE_WITHDRAWAL: 'balance-withdrawal',
  DISCOUNT_ADJUSTMENT: 'discount',
  INITIAL_BALANCE: 'initial-balance',
};

export const monthOf = (day: Day): MonthKey => day.slice(0, 7);

/** A metadata value when it is a string. */
const textOf = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

export function nextMonthKey(key: MonthKey): MonthKey {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return month === 12
    ? `${year + 1}-01`
    : `${year}-${String(month + 1).padStart(2, '0')}`;
}

export interface MonthSwitchFacts {
  /** Old-way charges of the month that the switch reversed. */
  oldCharged: number;
  /** Lessons paid the old way that a monthly charge covers again, credited back. */
  carriedIn: { lessons: number; amount: number };
}

export interface MonthsResult {
  months: StatementMonth[];
  switchFacts: Map<MonthKey, MonthSwitchFacts>;
  /** Positive PAYMENT rows, oldest first. */
  payments: StatementRow[];
  paid: number;
  /** Package lessons paid ahead, not held and not returned. */
  prepaidAhead: number;
  /** Balance minus everything explained; added as an item when not 0. */
  unexplained: number;
  /** The most common package size among the package charges. */
  packSize: number | null;
}

interface PackAcc {
  enrollmentId: string;
  group: string;
  lessons: number;
  cost: number;
  /** One per dated lesson, with that lesson's own share of the package. */
  slices: Array<{ day: Day; cost: number }>;
}

interface MonthlyAcc extends MonthlyPart {
  days: Day[];
}

interface MonthAcc {
  key: MonthKey;
  pack: Map<string, PackAcc>;
  monthly: MonthlyAcc[];
  items: StatementItem[];
  notes: StatementNote[];
  paid: number;
  preSystem: number;
  facts: MonthSwitchFacts;
}

function releaseWhy(
  description: string,
  md: Record<string, unknown>,
): ReleaseWhy {
  if (md.refundId !== undefined) return 'refund';
  if (/Guruh o'zgartirilganda/i.test(description)) return 'group-change';
  if (/Guruhdan chiqarilganda/i.test(description)) return 'left-group';
  if (/^O'quvchi muzlatildi|^Muzlatish:/i.test(description)) return 'frozen';
  if (/Cascade: Student .*EXPELLED/i.test(description)) return 'expelled';
  if (/Cascade: Group .*(COMPLETED|CANCELLED)/i.test(description)) {
    return 'group-closed';
  }
  if (description.includes(MIGRATION_REVERSAL)) return 'switch';
  if (/pul qaytarish/i.test(description)) return 'refund';
  return 'other';
}

function mostCommon(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Money the student paid against the lessons they had, month by month.
 *
 * A lesson's price lands in the month the lesson happened. Bookkeeping that
 * only undoes lesson charges (a returned package, the April cutover, a lesson
 * the monthly charge covers again, a monthly refund on leaving) is folded
 * into the lessons and kept as a note; every other credit or debit is a dated
 * item. The result reconciles to `Student.balance` to the som, and any
 * difference is added as an `unexplained` item instead of being hidden.
 */
export function buildMonths(input: StatementInput): MonthsResult {
  const groupOf = new Map(input.enrollments.map((e) => [e.id, e.group]));
  const packSizeOf = new Map(
    input.enrollments.map((e) => [e.id, e.course.lessonPaymentCount]),
  );
  const accs = new Map<MonthKey, MonthAcc>();
  const acc = (key: MonthKey): MonthAcc => {
    let found = accs.get(key);
    if (!found) {
      found = {
        key,
        pack: new Map(),
        monthly: [],
        items: [],
        notes: [],
        paid: 0,
        preSystem: 0,
        facts: { oldCharged: 0, carriedIn: { lessons: 0, amount: 0 } },
      };
      accs.set(key, found);
    }
    return found;
  };

  // 1. Lesson charges: every lesson lands in the month it happened.
  let unusedSlices = 0;
  const packPrices: Array<{ day: Day; perLesson: number }> = [];
  const packSizes: number[] = [];
  for (const r of input.rows) {
    if (r.type !== 'LESSON_DEDUCTION') continue;
    if (r.reversal) {
      if ((r.description ?? '').includes(MIGRATION_REVERSAL)) {
        acc(monthOf(r.day)).facts.oldCharged += r.amount;
      }
      continue;
    }
    if (r.reversed) continue;
    const md = r.metadata ?? {};
    if (md.mode === 'MONTHLY_PERIOD') {
      const period = typeof md.period === 'string' ? md.period : monthOf(r.day);
      const charge = input.charges.find(
        (c) => c.enrollmentId === r.enrollmentId && c.period === period,
      );
      const covered = Number(md.coveredLessons) || 0;
      const planned =
        Number(md.plannedLessons) || charge?.plannedLessons || covered;
      const creditAmount = charge?.creditAmount ?? 0;
      const returned = new Set(charge?.frozenOutDates ?? []);
      acc(period).monthly.push({
        group: groupOf.get(r.enrollmentId ?? '') ?? '',
        lessons: covered,
        planned,
        cost: -r.amount,
        perLesson:
          covered > 0 ? Math.round((-r.amount + creditAmount) / covered) : 0,
        fromDay:
          charge && covered < planned && charge.coveredDates.length > 0
            ? charge.coveredDates[0]
            : null,
        excusedLessons: charge?.excusedLessons ?? 0,
        creditLessons: charge?.creditLessons ?? 0,
        creditAmount,
        days: (charge?.coveredDates ?? []).filter((d) => !returned.has(d)),
      });
      continue;
    }
    const days = r.consumedDays ?? [];
    const slices = splitLessonSlices(
      r.amount,
      r.metadata as Prisma.JsonValue,
      days.map((d) => new Date(`${d}T00:00:00.000Z`)),
    );
    if (r.amount < 0 && slices.length > 0) {
      packPrices.push({
        day: r.day,
        perLesson: Math.round(-r.amount / slices.length),
      });
      if (r.enrollmentId) packSizes.push(packSizeOf.get(r.enrollmentId) ?? 12);
    }
    slices.forEach((slice, i) => {
      if (!slice.date) {
        unusedSlices += slice.cost;
        return;
      }
      const day = days[i];
      const key = r.enrollmentId ?? '';
      const month = acc(monthOf(day));
      const part = month.pack.get(key) ?? {
        enrollmentId: key,
        group: groupOf.get(key) ?? '',
        lessons: 0,
        cost: 0,
        slices: [],
      };
      part.lessons += 1;
      part.cost += slice.cost;
      part.slices.push({ day, cost: slice.cost });
      month.pack.set(key, part);
    });
  }

  // 2. Everything else.
  let released = 0;
  const payments: StatementRow[] = [];
  const perLessonBefore = (day: Day): number | null => {
    let found: number | null = null;
    for (const p of packPrices) if (p.day <= day) found = p.perLesson;
    return found;
  };
  const pushItem = (r: StatementRow, kind: ItemKind) => {
    acc(monthOf(r.day)).items.push({
      day: r.day,
      kind,
      amount: r.amount,
      description: r.description,
    });
  };
  for (const r of input.rows) {
    if (r.type === 'LESSON_DEDUCTION' || r.type === 'LESSON_CONSUMPTION') {
      continue;
    }
    if (r.reversed || r.reversal) continue;
    if (r.type === 'PAYMENT') {
      payments.push(r);
      acc(monthOf(r.day)).paid += r.amount;
      continue;
    }
    if (r.type !== 'ADJUSTMENT') {
      pushItem(r, ITEM_BY_TYPE[r.type] ?? 'correction');
      continue;
    }
    const md = r.metadata ?? {};
    const description = r.description ?? '';
    const monthlyRelease = MONTHLY_RELEASE_TEXT.exec(description);
    if (md.marker === 'overcharge-monthly-carried-in') {
      const month = acc(
        typeof md.period === 'string' ? md.period : monthOf(r.day),
      );
      const lessons = Number(md.lessons) || 0;
      const part = month.pack.get(
        textOf(md.oldEnrollmentId) ?? textOf(md.enrollmentId) ?? '',
      );
      if (!part) {
        // Nothing paid the old way to cancel: keep the money in sight.
        pushItem(r, 'correction');
        continue;
      }
      part.lessons -= lessons;
      part.cost -= r.amount;
      // The credit names its day when it was written for one lesson (a
      // re-join); the switch's own credits took the month's last lessons.
      const byDay = [...part.slices].sort((x, y) => x.day.localeCompare(y.day));
      const drop =
        typeof md.lessonDate === 'string'
          ? byDay.filter((x) => x.day === md.lessonDate).slice(0, 1)
          : byDay.slice(Math.max(0, byDay.length - lessons));
      part.slices = part.slices.filter((x) => !drop.includes(x));
      month.facts.carriedIn.lessons += lessons;
      month.facts.carriedIn.amount += r.amount;
    } else if (md.marker === 'april-cutover-refund') {
      acc(PRE_SYSTEM_MONTH).preSystem += r.amount;
    } else if (md.kind === 'monthly-release' || monthlyRelease) {
      acc(
        typeof md.period === 'string' ? md.period : monthOf(r.day),
      ).notes.push({
        day: r.day,
        kind: 'monthly-release',
        why: releaseWhy(description, md),
        lessons: Number(md.lessons) || Number(monthlyRelease?.[1]) || null,
        amount: r.amount,
      });
    } else if (
      md.kind === 'prepaid-release' ||
      md.refundId !== undefined ||
      PREPAID_RELEASE_TEXTS.some((re) => re.test(description))
    ) {
      released += r.amount;
      const per = perLessonBefore(r.day);
      const estimate =
        per && Math.abs(r.amount / per - Math.round(r.amount / per)) < 0.01
          ? Math.round(r.amount / per)
          : null;
      acc(monthOf(r.day)).notes.push({
        day: r.day,
        kind: 'prepaid-release',
        why: releaseWhy(description, md),
        lessons: Number(md.lessons ?? md.lessonsReleased) || estimate || null,
        amount: r.amount,
      });
    } else {
      pushItem(r, 'correction');
    }
  }

  // 2b. Returned money with no unused lesson to match means the replay
  // re-dated those lessons: a later lesson whose own charge the switch
  // reversed took the free place. On a day a monthly charge of the same
  // group also covers, that lesson is paid there, so it is freed here,
  // latest first, up to the returned money nothing else explains. An
  // overlap no returned money explains stays counted, in sight.
  let excess = released - unusedSlices;
  if (excess > 0) {
    const overlaps: Array<{ part: PackAcc; slice: PackAcc['slices'][number] }> =
      [];
    for (const a of accs.values()) {
      const covered = new Set(
        a.monthly.flatMap((m) => m.days.map((d) => `${d}|${m.group}`)),
      );
      if (covered.size === 0) continue;
      for (const part of a.pack.values()) {
        for (const slice of part.slices) {
          if (covered.has(`${slice.day}|${part.group}`)) {
            overlaps.push({ part, slice });
          }
        }
      }
    }
    overlaps.sort((x, y) => y.slice.day.localeCompare(x.slice.day));
    for (const { part, slice } of overlaps) {
      if (slice.cost > excess + ROUNDING_TOLERANCE) continue;
      part.slices = part.slices.filter((x) => x !== slice);
      part.lessons -= 1;
      part.cost -= slice.cost;
      unusedSlices += slice.cost;
      excess -= slice.cost;
      if (excess <= 0) break;
    }
  }

  // 3. Each month's lessons with the bookkeeping folded in.
  const summarize = (a: MonthAcc) => {
    const pack = [...a.pack.values()].filter(
      (p) => p.lessons !== 0 || p.cost !== 0,
    );
    const packLessons = pack.reduce((s, p) => s + p.lessons, 0);
    const packCost = pack.reduce((s, p) => s + p.cost, 0);
    const releases = a.notes.filter((n) => n.kind === 'monthly-release');
    const preSystemLessons =
      a.preSystem > 0 && packLessons > 0 && packCost > 0
        ? Math.min(
            packLessons,
            Math.round(a.preSystem / (packCost / packLessons)),
          )
        : 0;
    return {
      pack,
      preSystemLessons,
      lessons:
        packLessons +
        a.monthly.reduce((s, m) => s + m.lessons, 0) -
        releases.reduce((s, n) => s + (n.lessons ?? 0), 0) -
        preSystemLessons,
      cost:
        packCost +
        a.monthly.reduce((s, m) => s + m.cost, 0) -
        releases.reduce((s, n) => s + n.amount, 0) -
        a.preSystem,
    };
  };

  // 4. Reconcile to the balance; say any difference out loud.
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  const itemsTotal = [...accs.values()].reduce(
    (s, a) => s + a.items.reduce((t, i) => t + i.amount, 0),
    0,
  );
  const lessonsTotal = [...accs.values()].reduce(
    (s, a) => s + summarize(a).cost,
    0,
  );
  const prepaidAhead = Math.max(0, unusedSlices - released);
  const residual =
    input.student.balance - (paid + itemsTotal - lessonsTotal - prepaidAhead);
  const rounding = Math.abs(residual) <= ROUNDING_TOLERANCE;
  const unexplained = rounding ? 0 : residual;
  if (residual !== 0) {
    acc(monthOf(input.asOf)).items.push({
      day: input.asOf,
      kind: rounding ? 'rounding' : 'unexplained',
      amount: residual,
      description: null,
    });
  }

  // 5. Months from the first to the last with anything in them, gaps included.
  const used = [...accs.values()]
    .filter(
      (a) =>
        a.pack.size > 0 ||
        a.monthly.length > 0 ||
        a.items.length > 0 ||
        a.notes.length > 0 ||
        a.paid !== 0 ||
        a.preSystem !== 0 ||
        a.facts.oldCharged !== 0,
    )
    .map((a) => a.key)
    .sort();
  const keys: MonthKey[] = [];
  if (used.length > 0) {
    for (let key = used[0]; ; key = nextMonthKey(key)) {
      keys.push(key);
      if (key === used[used.length - 1]) break;
    }
  }

  const marks = new Map(
    input.attendance.map((a) => [`${a.day}|${a.group}`, a.status]),
  );
  const statusOf = (day: Day, group: string): LessonStatus => {
    const mark = marks.get(`${day}|${group}`);
    if (mark === 'PRESENT' || mark === 'LATE') return 'keldi';
    if (mark === 'ABSENT') return 'kelmagan';
    if (mark === 'EXCUSED') return 'uzrli';
    return day > input.asOf ? 'kelgusi' : 'belgilanmagan';
  };

  let running = 0;
  const months = keys.map((key): StatementMonth => {
    const a = acc(key);
    const s = summarize(a);
    const money = a.paid + a.items.reduce((t, i) => t + i.amount, 0);
    running += money - s.cost;
    const seen = new Set<string>();
    const lessonDays: LessonDay[] = [];
    const addDay = (day: Day, group: string) => {
      const k = `${day}|${group}`;
      if (seen.has(k)) return;
      seen.add(k);
      lessonDays.push({ day, group, status: statusOf(day, group) });
    };
    for (const p of s.pack) for (const x of p.slices) addDay(x.day, p.group);
    for (const m of a.monthly) for (const d of m.days) addDay(d, m.group);
    lessonDays.sort(
      (x, y) => x.day.localeCompare(y.day) || x.group.localeCompare(y.group),
    );
    const model: CoursePaymentModel | null =
      a.monthly.length > 0
        ? 'MONTHLY'
        : s.pack.some((p) => p.lessons > 0)
          ? 'LESSON_PACK'
          : null;
    return {
      key,
      lessons: s.lessons,
      absent: lessonDays.filter((d) => d.status === 'kelmagan').length,
      cost: s.cost,
      paid: a.paid,
      items: a.items,
      money,
      running,
      preSystem:
        a.preSystem > 0
          ? { lessons: s.preSystemLessons, amount: a.preSystem }
          : null,
      packParts: s.pack.map((p) => ({
        group: p.group,
        lessons: p.lessons,
        cost: p.cost,
        days: p.slices.map((x) => x.day).sort(),
      })),
      monthlyParts: a.monthly.map((m) => ({
        group: m.group,
        lessons: m.lessons,
        planned: m.planned,
        cost: m.cost,
        perLesson: m.perLesson,
        fromDay: m.fromDay,
        excusedLessons: m.excusedLessons,
        creditLessons: m.creditLessons,
        creditAmount: m.creditAmount,
      })),
      notes: a.notes,
      lessonDays,
      model,
      sharp: null,
    };
  });

  return {
    months,
    switchFacts: new Map(keys.map((k) => [k, acc(k).facts])),
    payments: payments.filter((p) => p.amount > 0),
    paid,
    prepaidAhead,
    unexplained,
    packSize: mostCommon(packSizes),
  };
}
