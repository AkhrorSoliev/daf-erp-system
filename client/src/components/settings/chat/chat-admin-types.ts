/** `GET/PATCH /chat/admin/settings` (CEO only). */
export interface ChatAdminSettings {
  enabled: boolean;
  weekMinutesActive: number;
  weekMinutesRadio: number;
}

export type ChatAdminSettingsPatch = Partial<ChatAdminSettings>;

export interface ChatPerson {
  id: number;
  name: string;
  username: string | null;
  chatBannedAt: string | null;
}

export type ChatReportStatus = "OPEN" | "RESOLVED" | "DISMISSED";

export interface ChatReportRow {
  id: string;
  status: ChatReportStatus;
  reason: string;
  createdAt: string;
  conversationId: string;
  reporter: ChatPerson;
  reported: ChatPerson;
}

/** One message of the text copy kept at report time (files are never part of it). */
export interface ChatSnapshotMessage {
  id: string;
  senderId: number;
  kind: "TEXT" | "IMAGE" | "VOICE";
  text: string | null;
  /** The first text, when the sender edited the message afterwards. */
  originalText?: string;
  hasFile: boolean;
  deleted: boolean;
  createdAt: string;
}

export interface ChatReportDetail extends ChatReportRow {
  resolvedAt: string | null;
  resolutionNote: string | null;
  snapshot: ChatSnapshotMessage[];
}

export interface ChatReportsPage {
  data: ChatReportRow[];
  nextCursor: string | null;
}

export interface ResolveReportBody {
  outcome: "RESOLVED" | "DISMISSED";
  note?: string;
  banReported?: boolean;
}

/** One row of `GET /chat/admin/banned` (newest first, at most BANNED_LIST_CAP). */
export interface ChatBannedRow {
  id: number;
  name: string;
  username: string | null;
  chatBannedAt: string;
}

export interface ChatBannedList {
  data: ChatBannedRow[];
}

export const BANNED_LIST_CAP = 200;
