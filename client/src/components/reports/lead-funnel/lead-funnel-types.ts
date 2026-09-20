export type FunnelStage = "lead" | "enrolled" | "attended" | "paid";
export type PeopleStage = FunnelStage | "unpaid";
export type PeopleMode = "all" | "stuck";
export type UnpaidStatusBucket = "active" | "frozen" | "expelled" | "other";

export interface FunnelPeriod {
  startDate: string;
  endDate: string;
}

export interface SourceBreakdownRow {
  id: string | null;
  name: string | null;
  lead: number;
  enrolled: number;
  attended: number;
  paid: number;
}

export interface BranchBreakdownRow {
  id: number | null;
  name: string | null;
  lead: number;
  paid: number;
}

export interface LeadFunnelResponse {
  period: FunnelPeriod;
  stages: Record<FunnelStage, number>;
  leadSplit: { board: number; direct: number };
  /** Shu uzunlikdagi oldingi davr; voronka boshlangan oyda `null`. */
  previous: { period: FunnelPeriod; stages: Record<FunnelStage, number> } | null;
  bySource: SourceBreakdownRow[];
  byBranch: BranchBreakdownRow[];
  unpaid: {
    total: number;
    active: number;
    frozen: number;
    expelled: number;
    /** Bitirgan, arxivlangan va h.k. — bo'laklar yig'indisi jamiga teng bo'lsin. */
    other: number;
  };
}

export interface FunnelPerson {
  key: string;
  name: string;
  phone: string | null;
  studentId: number | null;
  studentStatus: string | null;
  source: string | null;
  sourceId: string | null;
  createdAt: string;
}

export interface FunnelPeopleResponse {
  data: FunnelPerson[];
  total: number;
  page: number;
  pageSize: number;
}
