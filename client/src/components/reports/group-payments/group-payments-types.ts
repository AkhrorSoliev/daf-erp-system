/** Mirrors `server/src/reports/group-payments/group-payments.math.ts` (spec B5 §5.2–§5.3). */
export type Kesim = "guruh" | "ustoz" | "kurs";
export type Tartib = "foiz" | "qoldi" | "nomi";
export type GroupMark = "ochirilgan" | "yopilgan";
export type PayStatus = "toladi" | "qisman" | "tolamagan";
export type StudentMark = "arxivda" | "muzlatilgan" | "chiqqan";

export interface GpTotals { charged: number; paid: number; unpaid: number; paidPct: number | null; students: number; unpaidStudents: number }
export interface GpSummary extends GpTotals { groups: number; fullyPaidGroups: number; underHalfGroups: number; avgGroupPct: number | null }
export interface GpRow extends GpTotals { id: string; name: string; sub: string; teachers?: string[]; marks: GroupMark[] }
export interface GpRowsResponse { month: string; summary: GpSummary; rows: GpRow[]; total: number; multiTeacherNote: boolean }
export interface GpStudentLine {
  id: number; firstName: string; lastName: string; phone: string;
  charged: number; paid: number; unpaid: number; status: PayStatus; mark: StudentMark | null;
}
export interface GpGroupResponse {
  group: { id: string; name: string; course: string; teachers: string[]; deleted: boolean; closed: boolean };
  charged: number; paid: number; unpaid: number; paidPct: number | null;
  students: GpStudentLine[];
}
