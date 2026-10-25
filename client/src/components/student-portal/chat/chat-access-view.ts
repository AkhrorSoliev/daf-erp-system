import type { ChatAccess } from "./chat-types";

export interface AccessProgress {
  activeHave: number;
  activeNeed: number;
  radioHave: number;
  radioNeed: number;
}

export interface AccessView {
  mode: "open" | "warning" | "locked" | "banned";
  /** The server's own sentences, verbatim: data, never passed through t(). */
  lines: string[];
  /** Only a QUOTA lock draws bars; null otherwise. */
  progress: AccessProgress | null;
}

/** Reads the server's verdict; decides nothing itself. */
export function accessView(a: ChatAccess): AccessView {
  const progress: AccessProgress = {
    activeHave: a.quota.activeMin,
    activeNeed: a.quota.quota.activeMin,
    radioHave: a.quota.radioMin,
    radioNeed: a.quota.quota.radioMin,
  };
  if (a.reasons.includes("BANNED")) {
    return { mode: "banned", lines: a.messages, progress: null };
  }
  if (!a.canWrite) {
    const bars = a.reasons.includes("QUOTA") ? progress : null;
    return { mode: "locked", lines: a.messages, progress: bars };
  }
  if (a.warning) return { mode: "warning", lines: [a.warning], progress: null };
  return { mode: "open", lines: [], progress: null };
}
