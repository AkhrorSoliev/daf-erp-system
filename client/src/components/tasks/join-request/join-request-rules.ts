import { format } from "date-fns";

/** `GET /student-join-requests/by-task/:taskId` (server `join-request-view.ts`). */
export type JoinRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REPLACED";
export interface JoinRequestView {
  id: string; status: JoinRequestStatus; createdAt: string; decidedAt: string | null; rejectReason: string | null;
  firstName: string; lastName: string; phone: string; photo: string | null; telegramUsername: string | null;
  requestedGroup: { id: string; name: string } | null; approvedGroup: { id: string; name: string } | null;
  studentId: number | null; decidedBy: { id: number; firstName: string; lastName: string } | null;
  /** The branch's groups that take students. */
  groups: { id: string; name: string; teacherName: string | null }[];
  sameNameGroupIds: string[];
  lead: { createdAt: string; status: string; archived: boolean; sourceName: string | null } | null;
  archivedStudentId: number | null;
}
export interface JoinNote { tone: "info" | "warning" | "error"; text: string }

const day = (iso: string) => format(new Date(iso), "dd.MM.yyyy");

/** The requested group while it still takes students; otherwise the administrator picks one. */
export function initialGroupId(v: JoinRequestView): string | null {
  const id = v.requestedGroup?.id;
  return id && v.groups.some((g) => g.id === id) ? id : null;
}

/** The server refuses anything else; the button mirrors it. */
export function canApprove(v: JoinRequestView, groupId: string | null): boolean {
  return v.status === "PENDING" && groupId !== null && v.groups.some((g) => g.id === groupId);
}

/** What the server found about this person (spec §5.3). */
export function joinRequestNotes(v: JoinRequestView, groupId: string | null, leadStatusLabel: string | null): JoinNote[] {
  const notes: JoinNote[] = [];
  if (v.lead) {
    const archived = v.lead.archived ? " (arxivda)" : "";
    notes.push({ tone: "info", text: `Lid: ${day(v.lead.createdAt)} · ${v.lead.sourceName ?? "manbasiz"} · ${leadStatusLabel ?? v.lead.status}${archived}` });
  }
  if (v.archivedStudentId !== null) {
    notes.push({ tone: "warning", text: `Bu raqam arxivdagi #${v.archivedStudentId} o'quvchiniki — uni tiklash to'g'riroq bo'lishi mumkin` });
  }
  if (groupId !== null && v.sameNameGroupIds.includes(groupId)) {
    notes.push({ tone: "warning", text: "Guruhda shu ismli o'quvchi bor" });
  }
  if (v.status === "PENDING" && initialGroupId(v) === null) {
    notes.push({ tone: "error", text: `«${v.requestedGroup?.name ?? "So'ralgan guruh"}» guruhiga yozilib bo'lmaydi — boshqa guruhni tanlang` });
  }
  return notes;
}

/** A decided request reads as one line; a pending one has none. */
export function decidedLine(v: JoinRequestView): string | null {
  switch (v.status) {
    case "PENDING":
      return null;
    case "APPROVED": {
      const who = v.decidedBy ? `${v.decidedBy.firstName} ${v.decidedBy.lastName.slice(0, 1)}.` : "Tizim";
      return `Tasdiqlandi — #${v.studentId} (${who}, ${v.decidedAt ? day(v.decidedAt) : "—"})`;
    }
    case "REJECTED":
      return `Rad etildi: ${v.rejectReason ?? ""}`.trim();
    case "EXPIRED":
      return "Muddati o'tdi — 7 kun ichida javob berilmadi";
    case "REPLACED":
      return "Yangi so'rov bilan almashtirildi";
  }
}
