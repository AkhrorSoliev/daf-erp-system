import { format } from "date-fns";
import { tashkentDayAsLocalDate, tashkentDdMm, tashkentHhmm } from "@/lib/tashkent-time";

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

// Every date on the Tashkent clock, never the browser's zone.
const day = (iso: string) => format(tashkentDayAsLocalDate(iso), "dd.MM.yyyy");

/** "dd.MM.yyyy, HH:mm" in Tashkent — when the request came in. */
export function requestedAtText(iso: string): string {
  return `${day(iso)}, ${tashkentHhmm(iso)}`;
}

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
  // The group in the picker, not the requested one: a valid other pick clears it.
  if (v.status === "PENDING" && !v.groups.some((g) => g.id === groupId)) {
    const requested = groupId === null || groupId === v.requestedGroup?.id;
    const subject = !requested ? "Tanlangan guruhga" : v.requestedGroup ? `«${v.requestedGroup.name}» guruhiga` : "So'ralgan guruhga";
    notes.push({ tone: "error", text: `${subject} yozilib bo'lmaydi — boshqa guruhni tanlang` });
  }
  return notes;
}

/**
 * A decided request reads as one line (spec §5.3): `text`, then — once
 * approved — the card's `#id` (a link to it) and `tail`. A pending one has none.
 */
export interface DecidedLine { text: string; studentId: number | null; tail: string }

export function decidedLine(v: JoinRequestView): DecidedLine | null {
  const line = (text: string): DecidedLine => ({ text, studentId: null, tail: "" });
  switch (v.status) {
    case "PENDING":
      return null;
    case "APPROVED": {
      const who = v.decidedBy ? `${v.decidedBy.firstName} ${v.decidedBy.lastName.slice(0, 1)}.` : "Tizim";
      const when = v.decidedAt ? `${tashkentDdMm(v.decidedAt)} ${tashkentHhmm(v.decidedAt)}` : "—";
      return { text: "Tasdiqlandi — ", studentId: v.studentId, tail: ` (${who}, ${when})` };
    }
    case "REJECTED":
      return line(`Rad etildi: ${v.rejectReason ?? ""}`.trim());
    case "EXPIRED":
      return line("Muddati o'tdi — 7 kun ichida javob berilmadi");
    case "REPLACED":
      return line("Yangi so'rov bilan almashtirildi");
  }
}
