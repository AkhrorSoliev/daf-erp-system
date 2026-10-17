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

export interface AudienceOverview {
  summary: AudienceStat;
  bands: AgeBandRow[];
  branches: AudienceCutRow[];
  courses: AudienceCutRow[];
}
