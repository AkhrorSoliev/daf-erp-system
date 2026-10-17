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

export interface AgeBandRow {
  key: string;
  label: string;
  count: number;
  pct: number | null;
}

export interface AudienceOverview {
  summary: AudienceStat;
  bands: AgeBandRow[];
  branches: AudienceCutRow[];
  courses: AudienceCutRow[];
}
