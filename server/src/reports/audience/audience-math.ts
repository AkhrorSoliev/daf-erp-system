import { ageOn } from '../../students/shared/student-onboarding';
import type {
  AgeBandRow,
  AudienceCutRow,
  AudienceOverview,
  AudienceStat,
  AudienceStudent,
} from './audience.types';

/** A share or an average is printed only when at least this many students back it. */
export const MIN_KNOWN = 5;

/** Age bands, upper bound exclusive; the last one is open. The one place the edges live. */
export const AGE_BANDS: readonly {
  key: string;
  label: string;
  below: number;
}[] = [
  { key: 'u12', label: '12 dan kichik', below: 12 },
  { key: '12-15', label: '12–15', below: 16 },
  { key: '16-18', label: '16–18', below: 19 },
  { key: '19-22', label: '19–22', below: 23 },
  { key: '23-29', label: '23–29', below: 30 },
  { key: '30+', label: '30+', below: Infinity },
];

const bandIndex = (age: number) => AGE_BANDS.findIndex((b) => age < b.below);

const round1 = (n: number) => Math.round(n * 10) / 10;
const pctOf = (part: number, whole: number) =>
  whole < MIN_KNOWN ? null : Math.round((part / whole) * 100);

/** Full years of every student who gave a birth date, on the Tashkent day `today`. */
function agesOf(students: AudienceStudent[], today: string): number[] {
  return students.flatMap((s) =>
    s.birthDate ? [ageOn(s.birthDate, today)] : [],
  );
}

export function statOf(
  students: AudienceStudent[],
  today: string,
): AudienceStat {
  const male = students.filter((s) => s.gender === 'MALE').length;
  const female = students.filter((s) => s.gender === 'FEMALE').length;
  const genderKnown = male + female;
  const ages = agesOf(students, today);
  const malePct = pctOf(male, genderKnown);
  return {
    total: students.length,
    genderKnown,
    male,
    female,
    malePct,
    // The two shares always add up to 100.
    femalePct: malePct === null ? null : 100 - malePct,
    ageKnown: ages.length,
    avgAge:
      ages.length < MIN_KNOWN
        ? null
        : round1(ages.reduce((a, b) => a + b, 0) / ages.length),
  };
}

export function bandsOf(
  students: AudienceStudent[],
  today: string,
): AgeBandRow[] {
  const ages = agesOf(students, today);
  const counts = AGE_BANDS.map(() => 0);
  for (const a of ages) counts[bandIndex(a)] += 1;
  return AGE_BANDS.map((b, i) => ({
    key: b.key,
    label: b.label,
    count: counts[i],
    // ponytail: shares are rounded one by one, so a column can print 99 or 101.
    pct: pctOf(counts[i], ages.length),
  }));
}

/** Groups students by a key and gives each group the page's figures; biggest first. */
function cutOf(
  students: AudienceStudent[],
  today: string,
  pick: (s: AudienceStudent) => { key: string; name: string },
): AudienceCutRow[] {
  const groups = new Map<string, { name: string; rows: AudienceStudent[] }>();
  for (const s of students) {
    const { key, name } = pick(s);
    const g = groups.get(key) ?? { name, rows: [] };
    g.rows.push(s);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, name: g.name, ...statOf(g.rows, today) }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        a.name.localeCompare(b.name, 'uz', { numeric: true }),
    );
}

export function buildOverview(
  students: AudienceStudent[],
  today: string,
): AudienceOverview {
  return {
    summary: statOf(students, today),
    bands: bandsOf(students, today),
    branches: cutOf(students, today, (s) => ({
      key: s.branchId === null ? 'none' : String(s.branchId),
      name: s.branchName ?? 'Filial belgilanmagan',
    })),
    courses: cutOf(students, today, (s) => ({
      key: s.courseId ?? 'none',
      name: s.courseName ?? 'Kurs belgilanmagan',
    })),
  };
}
