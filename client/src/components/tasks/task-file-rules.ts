import type { TaskEvent, TaskFileView } from "@/hooks/use-tasks";
import { msg } from "@/i18n/msg";
import { uzbek, type Translate } from "./task-labels";

/** The server's limits (task-file-rules.ts, ADR-0086), checked here first to save a 20 MB round trip. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const VOICE_LIMIT_SEC = 180;
/** A voice note is capped by size too (server `MAX_VOICE_BYTES`). */
export const MAX_VOICE_BYTES = 2 * 1024 * 1024;
export const VOICE_TOO_BIG = msg("Ovozli xabar 2 MB dan oshmasligi kerak");
export const URL_REFRESH_FAILED = msg("Fayl havolasini yangilab bo'lmadi. Qayta urinib ko'ring.");
/** Links live 10 minutes; the open drawer re-reads the list sooner. */
export const FILE_URL_REFRESH_MS = 8 * 60_000;
export const FILE_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx,video/mp4,audio/ogg,audio/webm";
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const FILE_TOO_BIG = msg("Fayl hajmi 20 MB dan oshmasligi kerak");

const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
/** The unit words follow the page language (`t`, Uzbek by default); the figure keeps its format. */
export function formatSize(bytes: number, t: Translate = uzbek): string {
  if (bytes < 1024) return t("{n} B", { n: String(bytes) });
  const kb = Math.round((bytes / 1024) * 10) / 10;
  // 1 048 575 B rounds to 1024 KB: that prints as 1 MB instead.
  if (kb < 1024) return t("{n} KB", { n: one(kb) });
  return t("{n} MB", { n: one(Math.round((bytes / 1024 / 1024) * 10) / 10) });
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The live file a FILE / VOICE row points at; undefined once deleted (or not loaded yet). */
export function fileOfEvent(files: TaskFileView[], ev: Pick<TaskEvent, "fileId">): TaskFileView | undefined {
  return ev.fileId ? files.find((f) => f.id === ev.fileId) : undefined;
}

/** «Rasm qo'shib, tekshiruvga yuborish» instead of «Bajardim» (spec screen 8, server `changeStatusTx`). */
export function photoFirst(task: { requiresPhoto: boolean }, target: "DONE" | "IN_REVIEW", hasFreshPhoto: boolean): boolean {
  return task.requiresPhoto && target === "IN_REVIEW" && !hasFreshPhoto;
}

const VOICE_MIMES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus"];
/** null = this browser cannot record a type the server takes (the mic button is hidden). */
export function pickVoiceMime(isSupported: (type: string) => boolean): string | null {
  return VOICE_MIMES.find((type) => isSupported(type)) ?? null;
}
export const voiceFileName = (mime: string) => (mime.startsWith("audio/ogg") ? "ovozli-xabar.ogg" : "ovozli-xabar.webm");

export type VoiceState =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "ready"; blob: Blob; url: string; durationSec: number };
export type VoiceAction =
  | { type: "start"; at: number }
  | { type: "stop"; at: number; blob: Blob; url: string }
  | { type: "reset" };

/** Spec screen 15: oddiy → yozilmoqda → yuborishga tayyor. */
export function voiceReducer(s: VoiceState, a: VoiceAction): VoiceState {
  switch (a.type) {
    case "start":
      return s.kind === "recording" ? s : { kind: "recording", startedAt: a.at };
    case "stop": {
      if (s.kind !== "recording") return s;
      const durationSec = Math.min(VOICE_LIMIT_SEC, Math.max(1, Math.round((a.at - s.startedAt) / 1000)));
      return { kind: "ready", blob: a.blob, url: a.url, durationSec };
    }
    case "reset":
      return { kind: "idle" };
  }
}
