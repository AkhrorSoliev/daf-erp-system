import type { Gender } from '@prisma/client';

/** One studying student, as the page needs them (spec: auditoriya hisoboti). */
export interface AudienceStudent {
  gender: Gender | null;
  /** Tashkent calendar day of the birth date, `YYYY-MM-DD`; null = not given. */
  birthDate: string | null;
  branchId: number | null;
  branchName: string | null;
  courseId: string | null;
  courseName: string | null;
  /** The studying group's level as staff wrote it («A1»); null = not given. */
  level: string | null;
}

export interface AgeBandRow {
  key: string;
  label: string;
  count: number;
  /** Whole percent of `ageKnown`; null while fewer than `MIN_KNOWN` ages are known. */
  pct: number | null;
}

/** The same figures for the whole page and for every cut row. */
export interface AudienceStat {
  total: number;
  genderKnown: number;
  male: number;
  female: number;
  malePct: number | null;
  femalePct: number | null;
  ageKnown: number;
  avgAge: number | null;
}

export interface AudienceCutRow extends AudienceStat {
  key: string;
  name: string;
}

/** One age band of the leavers table: who studies now, who left, and the leaving share. */
export interface DepartureBandRow {
  key: string;
  label: string;
  active: number;
  departed: number;
  /** departed ÷ (active + departed), whole percent; null while fewer than `MIN_KNOWN` people stand behind it. */
  share: number | null;
}

/** Confirmed departures of the last 12 months (ADR-0035) with a known age. */
export interface DepartureAges {
  ages: number[];
  /** Leavers whose birth date is not given. */
  ageUnknown: number;
}

export interface AudienceOverview {
  /** Everyone the system holds in scope (not deleted, archived or prospect), studying or not. */
  systemTotal: number;
  summary: AudienceStat;
  bands: AgeBandRow[];
  branches: AudienceCutRow[];
  courses: AudienceCutRow[];
  levels: AudienceCutRow[];
  departures: DepartureBandRow[];
  /** Leavers of the last 12 months whose age is not known. */
  departuresAgeUnknown: number;
}
