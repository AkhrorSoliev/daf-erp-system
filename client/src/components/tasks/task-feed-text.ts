import type { TaskEvent, TaskPerson, TaskStatus } from "@/hooks/use-tasks";
import { STATUS_LABEL } from "./task-labels";

export const SYSTEM_NAME = "Tizim";

export const personName = (p: TaskPerson) => `${p.firstName} ${p.lastName}`;

const str = (meta: TaskEvent["meta"], key: string): string | null => {
  const v = meta?.[key];
  return typeof v === "string" && v ? v : null;
};
const quoted = (s: string | null) => (s ? `«${s}»` : "");
const statusLabel = (v: string | null) => (v && v in STATUS_LABEL ? STATUS_LABEL[v as TaskStatus] : null);

// Why the system closed a task (`meta.reason`); a lesson answer, or an older row, otherwise.
const CLOSE_REASON: Record<string, string> = {
  GROUP_DELETED: "guruh o'chirildi",
  JOIN_APPROVED: "so'rov tasdiqlandi",
  JOIN_REJECTED: "so'rov rad etildi",
  JOIN_EXPIRED: "so'rov muddati o'tdi",
  JOIN_REPLACED: "yangi so'rov bilan almashtirildi",
};

function stepLine(meta: TaskEvent["meta"]): string {
  const title = quoted(str(meta, "title"));
  switch (str(meta, "action")) {
    case "added": return `${title} qadamini qo'shdi`;
    case "done": return `${title} qadamini belgiladi`;
    case "undone": return `${title} qadamidan belgini oldi`;
    case "deleted": return `${title} qadamini o'chirdi`;
    case "renamed": return `${quoted(str(meta, "from"))} qadamini ${quoted(str(meta, "to"))} deb o'zgartirdi`;
    default: return "qadamni o'zgartirdi";
  }
}

/**
 * One feed line: who did it and what, in Uzbek. The server writes `meta` per
 * event type; a row of an older shape (a migrated one carries `{ to }` only) or
 * an unknown type still reads as a line, never as a blank or a crash.
 */
export function describeEvent(ev: TaskEvent): { actor: string; text: string } {
  const actor = ev.actor ? personName(ev.actor) : SYSTEM_NAME;
  switch (ev.type) {
    case "COMMENT": return { actor, text: ev.text ?? "" };
    case "CREATED": return { actor, text: "topshiriq berdi" };
    case "STATUS": {
      const to = statusLabel(str(ev.meta, "to"));
      return { actor, text: to ? `holatni ${to} qildi` : "holatni o'zgartirdi" };
    }
    case "RETURN": return { actor, text: ev.text ? `qaytardi: «${ev.text}»` : "qaytardi" };
    case "STEP": return { actor, text: stepLine(ev.meta) };
    case "ASSIGNEE": return { actor, text: "ijrochilarni o'zgartirdi" };
    case "CANCELLED": return { actor, text: ev.text ? `bekor qildi: «${ev.text}»` : "bekor qildi" };
    // The system closes it, even when the row names the person whose answer did.
    case "AUTO_CLOSED":
      return { actor: SYSTEM_NAME, text: `yopdi (${CLOSE_REASON[str(ev.meta, "reason") ?? ""] ?? "darsga javob berildi"})` };
    case "REASSIGNED": return { actor, text: "ishdan ketgani uchun topshiriq o'tkazildi" };
    // A type this client does not know yet: a line anyone can read, never an enum name.
    default: return { actor, text: "yangilanish kiritdi" };
  }
}

/** « · Telegram orqali» for what was written in the bot; nothing for the web and the system. */
export const viaLabel = (ev: TaskEvent): string | null => (ev.via === "TELEGRAM" ? "Telegram orqali" : null);
