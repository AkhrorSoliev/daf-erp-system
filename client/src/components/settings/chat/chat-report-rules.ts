import type { Translate } from "@/components/notifications/notification-view";
import { tashkentWallClock } from "@/lib/tashkent-time";
import type { ChatReportDetail, ChatReportRow, ChatReportStatus, ChatSnapshotMessage, ResolveReportBody } from "./chat-admin-types";

export function statusLabel(status: ChatReportStatus, t: Translate): string {
  if (status === "OPEN") return t("Ochiq");
  if (status === "RESOLVED") return t("Hal qilindi");
  return t("Rad etildi");
}

export interface SnapshotLine {
  id: string;
  side: "reporter" | "reported" | "other";
  kind: ChatSnapshotMessage["kind"];
  /** TEXT only, as stored (data, never translated); null for IMAGE/VOICE. */
  text: string | null;
  /** TEXT only: the first text of an edited message, null when never edited. */
  originalText: string | null;
  deleted: boolean;
  hasFile: boolean;
  createdAt: string;
}

export function snapshotLines(report: ChatReportDetail): SnapshotLine[] {
  return report.snapshot.map((m) => ({
    id: m.id,
    side: m.senderId === report.reporter.id ? "reporter" : m.senderId === report.reported.id ? "reported" : "other",
    kind: m.kind,
    text: m.kind === "TEXT" ? (m.text ?? "") : null,
    originalText: m.kind === "TEXT" ? (m.originalText ?? null) : null,
    deleted: m.deleted,
    hasFile: m.hasFile,
    createdAt: m.createdAt,
  }));
}

export const canResolve = (report: Pick<ChatReportRow, "status">): boolean => report.status === "OPEN";

export function resolveBody(outcome: ResolveReportBody["outcome"], note: string, banReported: boolean): ResolveReportBody {
  const body: ResolveReportBody = { outcome };
  const trimmed = note.trim();
  if (trimmed) body.note = trimmed;
  if (banReported && outcome === "RESOLVED") body.banReported = true;
  return body;
}

export const HOLAT_VALUES = ["ochiq", "hal-qilingan", "rad-etilgan", "hammasi"] as const;

/** The `?holat=` URL value → the API `status` param (undefined = all); unknown → «ochiq». */
export function statusFilterToParam(holat: string | undefined): ChatReportStatus | undefined {
  if (holat === "hal-qilingan") return "RESOLVED";
  if (holat === "rad-etilgan") return "DISMISSED";
  if (holat === "hammasi") return undefined;
  return "OPEN";
}

/** The URL value actually in force (an unknown one reads as the default). */
export const cleanHolat = (holat: string | undefined): (typeof HOLAT_VALUES)[number] =>
  (HOLAT_VALUES as readonly string[]).includes(holat ?? "") ? (holat as (typeof HOLAT_VALUES)[number]) : "ochiq";

const pad = (n: number) => String(n).padStart(2, "0");

/** «dd.MM.yyyy, HH:mm» on the Tashkent clock. */
export function formatReportDate(instant: string): string {
  const d = tashkentWallClock(instant);
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
