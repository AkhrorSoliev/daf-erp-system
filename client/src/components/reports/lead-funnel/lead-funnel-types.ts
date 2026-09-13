export type FunnelStage = "lead" | "enrolled" | "attended" | "paid";
export type PeopleStage = FunnelStage | "unpaid";
export type PeopleMode = "all" | "stuck";

export interface LeadFunnelResponse {
  period: { startDate: string; endDate: string };
  stages: Record<FunnelStage, number>;
  leadSplit: { board: number; direct: number };
  unpaid: { total: number; active: number; frozen: number; expelled: number };
}

export interface FunnelPerson {
  key: string;
  name: string;
  phone: string | null;
  studentId: number | null;
  studentStatus: string | null;
  source: string | null;
  createdAt: string;
}

export interface FunnelPeopleResponse {
  data: FunnelPerson[];
  total: number;
  page: number;
  pageSize: number;
}
