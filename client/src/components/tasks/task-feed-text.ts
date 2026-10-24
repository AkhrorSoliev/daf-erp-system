import type { TaskEvent, TaskPerson, TaskStatus } from "@/hooks/use-tasks";
import { msg } from "@/i18n/msg";
import { STATUS_LABEL, SYSTEM_LABEL, statusText, uzbek, type Translate } from "./task-labels";

/** Who acted when the row has no person; «Tizim» alone is the colour mode. A `msg()` text. */
export const SYSTEM_NAME = SYSTEM_LABEL;

export const personName = (p: TaskPerson) => `${p.firstName} ${p.lastName}`;

const str = (meta: TaskEvent["meta"], key: string): string | null => {
  const v = meta?.[key];
  return typeof v === "string" && v ? v : null;
};
const quoted = (s: string | null) => (s ? `«${s}»` : "");
const statusLabel = (v: string | null, t: Translate) => (v && v in STATUS_LABEL ? statusText(v as TaskStatus, t) : null);

// Why the system closed a task (`meta.reason`); a lesson answer, or an older row, otherwise. msg() texts.
const CLOSE_REASON: Record<string, string> = {
  GROUP_DELETED: msg("guruh o'chirildi"),
  JOIN_APPROVED: msg("so'rov tasdiqlandi"),
  JOIN_REJECTED: msg("so'rov rad etildi"),
  JOIN_EXPIRED: msg("so'rov muddati o'tdi"),
  JOIN_REPLACED: msg("yangi so'rov bilan almashtirildi"),
  PAYMENT_RECEIVED: msg("to'lov qilindi"),
  CALL_LOGGED: msg("qo'ng'iroq yozildi"),
  LEAD_CALLED: msg("lidga qo'ng'iroq qilindi"),
  LEAD_STATUS_CHANGED: msg("lid holati o'zgardi"),
  LEAD_GONE: msg("lid endi qo'ng'iroq kutmaydi"),
  STUDENT_GONE: msg("o'quvchi arxivlandi"),
  DEBT_CLEARED: msg("qarz yopildi"),
  STUDENT_ENROLLED: msg("o'quvchi qayta guruhga yozildi"),
  MONTH_RELEASED: msg("oy puli qaytarildi"),
};

function closeReason(meta: TaskEvent["meta"], t: Translate): string {
  const reason = CLOSE_REASON[str(meta, "reason") ?? ""];
  return reason ? t(reason) : t("darsga javob berildi");
}

function stepLine(meta: TaskEvent["meta"], t: Translate): string {
  const title = quoted(str(meta, "title"));
  switch (str(meta, "action")) {
    case "added": return t("{title} qadamini qo'shdi", { title });
    case "done": return t("{title} qadamini belgiladi", { title });
    case "undone": return t("{title} qadamidan belgini oldi", { title });
    case "deleted": return t("{title} qadamini o'chirdi", { title });
    case "renamed": return t("{from} qadamini {to} deb o'zgartirdi", { from: quoted(str(meta, "from")), to: quoted(str(meta, "to")) });
    default: return t("qadamni o'zgartirdi");
  }
}

/**
 * One feed line: who did it and what, in the page's language (`t`, Uzbek by
 * default). The server writes `meta` per event type; a row of an older shape (a
 * migrated one carries `{ to }` only) or an unknown type still reads as a line,
 * never as a blank or a crash. Names, comments, reasons and file names are data.
 */
export function describeEvent(ev: TaskEvent, t: Translate = uzbek): { actor: string; text: string } {
  const actor = ev.actor ? personName(ev.actor) : t(SYSTEM_NAME);
  switch (ev.type) {
    case "COMMENT": return { actor, text: ev.text ?? "" };
    case "CREATED": return { actor, text: t("topshiriq berdi") };
    case "STATUS": {
      const to = statusLabel(str(ev.meta, "to"), t);
      return { actor, text: to ? t("holatni {status} qildi", { status: to }) : t("holatni o'zgartirdi") };
    }
    case "RETURN": return { actor, text: ev.text ? t("qaytardi: «{reason}»", { reason: ev.text }) : t("qaytardi") };
    case "STEP": return { actor, text: stepLine(ev.meta, t) };
    case "ASSIGNEE": return { actor, text: t("ijrochilarni o'zgartirdi") };
    case "CANCELLED": return { actor, text: ev.text ? t("bekor qildi: «{reason}»", { reason: ev.text }) : t("bekor qildi") };
    case "FILE": return { actor, text: ev.text ?? t("fayl") };
    case "VOICE": return { actor, text: t("ovozli xabar") };
    case "FILE_DELETED": return { actor, text: ev.text ? t("faylni o'chirdi: «{name}»", { name: ev.text }) : t("faylni o'chirdi") };
    // The system closes it, even when the row names the person whose answer did.
    case "AUTO_CLOSED":
      return { actor: t(SYSTEM_NAME), text: t("yopdi ({reason})", { reason: closeReason(ev.meta, t) }) };
    case "REASSIGNED": return { actor, text: t("ishdan ketgani uchun topshiriq o'tkazildi") };
    // A type this client does not know yet: a line anyone can read, never an enum name.
    default: return { actor, text: t("yangilanish kiritdi") };
  }
}

/** « · Telegram orqali» for what was written in the bot; nothing for the web and the system. */
export const viaLabel = (ev: TaskEvent, t: Translate = uzbek): string | null => (ev.via === "TELEGRAM" ? t("Telegram orqali") : null);
