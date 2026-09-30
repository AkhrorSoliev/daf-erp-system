import {
  perLessonAccrual,
  pickActiveVersion,
  type RateVersion,
} from './deserved-math';

/**
 * «Berilmadi» — lessons that ended with no attendance (or were answered
 * «Bo'ldi» without an exemption, ADR-0054), and the pay the teacher lost on
 * each (ADR-0048, design «Davomat va to'lov tartibi» R1).
 *
 * Computed on read, never stored: a missed lesson is a fact of the calendar
 * and the attendance table, both of which are already stored. A nightly
 * snapshot would be a second copy free to disagree with them.
 */

/** Lessons from this Tashkent day on can be «Berilmadi». */
export const MISSED_LESSONS_START_DAY = '2026-10-01';

export interface MissedLessonGroup {
  id: string;
  name: string;
  /** The group's planned lesson days in the range, 'YYYY-MM-DD', ascending. */
  plannedDates: string[];
}

export interface MissedLessonCharge {
  groupId: string;
  studentId: number;
  /** 'YYYY-MM-DD' the month charge paid for. */
  coveredDates: readonly string[];
  /** Covered dates a freeze or a departure has already returned. */
  frozenOutDates: readonly string[];
  /** Undiscounted: teacher pay is read from it (as `createAccrual` does). */
  perLessonCost: number;
  plannedLessons: number;
}

export interface MissedLessonsInput {
  teacherId: number;
  groups: MissedLessonGroup[];
  /**
   * `${groupId}::${date}` of every lesson that counts as taken: a register
   * with no forfeited «Dars bo'ldimi?» row, or an exempt row (ADR-0054).
   */
  takenLessons: ReadonlySet<string>;
  /** `${groupId}::${date}` → the substitute override's teacher ids. */
  overrides: ReadonlyMap<string, readonly number[]>;
  /** CHARGED month charges of the groups for the month. */
  charges: readonly MissedLessonCharge[];
  /** `${groupId}::${studentId}::${date}` of pre-marked «Sababli» absences. */
  excused: ReadonlySet<string>;
  /** Per-group version rows first, then the teacher's global ones. */
  rateVersions: {
    byGroup: ReadonlyMap<string, RateVersion[]>;
    global: RateVersion[];
  };
}

export interface MissedLesson {
  /** 'YYYY-MM-DD'. */
  date: string;
  groupId: string;
  groupName: string;
  /** Students whose paid lesson it was. */
  students: number;
  /** The teacher's pay for those students on that day. */
  amount: number;
}

export interface MissedLessonsResult {
  lessons: MissedLesson[];
  total: number;
}

/**
 * Every planned lesson of the teacher's groups not in `takenLessons`. A
 * lesson a substitute override gave to other teachers is not this teacher's
 * to miss. The pay is what the same lesson would have accrued: for each
 * student whose month charge covered the day (not frozen out, not pre-marked
 * «Sababli»), the rate active on the day — per-group version first, then the
 * global one — over that charge's `perLessonCost` and `plannedLessons`.
 * A lesson with no such student cost the teacher nothing and is left out.
 */
export function computeMissedLessons(
  input: MissedLessonsInput,
): MissedLessonsResult {
  const lessons: MissedLesson[] = [];
  const chargesByGroup = new Map<string, MissedLessonCharge[]>();
  for (const c of input.charges) {
    const arr = chargesByGroup.get(c.groupId) ?? [];
    arr.push(c);
    chargesByGroup.set(c.groupId, arr);
  }

  for (const group of input.groups) {
    for (const date of group.plannedDates) {
      const key = `${group.id}::${date}`;
      if (input.takenLessons.has(key)) continue;
      const override = input.overrides.get(key);
      if (override && !override.includes(input.teacherId)) continue;

      const at = new Date(`${date}T00:00:00.000Z`);
      const version =
        pickActiveVersion(input.rateVersions.byGroup.get(group.id), at) ??
        pickActiveVersion(input.rateVersions.global, at);

      const counted = new Set<number>();
      let amount = 0;
      for (const c of chargesByGroup.get(group.id) ?? []) {
        if (counted.has(c.studentId)) continue;
        if (!c.coveredDates.includes(date)) continue;
        if (c.frozenOutDates.includes(date)) continue;
        if (input.excused.has(`${group.id}::${c.studentId}::${date}`)) continue;
        counted.add(c.studentId);
        if (version) {
          amount += perLessonAccrual(
            version,
            c.perLessonCost,
            c.plannedLessons,
          );
        }
      }
      if (counted.size === 0) continue;
      lessons.push({
        date,
        groupId: group.id,
        groupName: group.name,
        students: counted.size,
        amount,
      });
    }
  }

  lessons.sort((a, b) =>
    a.date === b.date
      ? a.groupName.localeCompare(b.groupName)
      : a.date.localeCompare(b.date),
  );
  return { lessons, total: lessons.reduce((s, l) => s + l.amount, 0) };
}
