/** `GET /reports/audience/overview` — the server's answer; the page only arranges and formats it. */
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

/** One age band of the leavers table. */
export interface DepartureBandRow {
  key: string;
  label: string;
  /** Studying now. */
  active: number;
  /** Left in the last 12 months. */
  departed: number;
  /** departed ÷ (active + departed), whole percent; null while too few people stand behind it. */
  share: number | null;
}

export interface AudienceOverview {
  /** Everyone the system holds in scope, studying or not. */
  systemTotal: number;
  summary: AudienceStat;
  courses: AudienceCutRow[];
  levels: AudienceCutRow[];
  departures: DepartureBandRow[];
  /** Leavers of the last 12 months whose age is not known. */
  departuresAgeUnknown: number;
}
