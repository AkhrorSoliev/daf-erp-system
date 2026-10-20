import type { LogCallPrefill } from "@/components/outreach/log-call-dialog";
import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import type { TaskDetail, TaskSource, TaskSourceCall } from "@/hooks/use-tasks";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import type { Can } from "@/lib/permission-check";
import { tashkentDdMm, tashkentHhmm } from "@/lib/tashkent-time";
import { taskEntityHref } from "./task-href";
import { msg } from "@/i18n/msg";
import { isOpenStatus, uzbek, type Translate } from "./task-labels";

export const CALL_ACTION = msg("Qo'ng'iroqni yozish");
export const LEAD_ACTION = msg("Lidni ochish");

export type SourceAction =
  | { kind: "call"; label: string; prefill: LogCallPrefill }
  | { kind: "lead"; label: string; href: string };

/**
 * The one button of a system task's card (spec screen 10), doing the job where
 * it is done: a call is logged in the outreach dialog (which closes the task on
 * the server), a lead is called from its drawer. None on a closed task or for a
 * viewer the server would refuse.
 */
export function sourceAction(task: Pick<TaskDetail, "status">, source: TaskSource | null | undefined, can: Can): SourceAction | null {
  if (!source || !isOpenStatus(task.status)) return null;
  if (source.student) {
    if (!can("calls.log")) return null;
    const s = source.student;
    return {
      kind: "call",
      label: CALL_ACTION,
      prefill: { studentId: s.id, studentLabel: s.name, studentPhone: s.phone, reason: source.callReason ?? "OTHER" },
    };
  }
  if (source.lead && can("leads.view")) {
    const href = taskEntityHref("Lead", source.lead.id, can);
    return href ? { kind: "lead", label: LEAD_ACTION, href } : null;
  }
  return null;
}

export interface SourceFact { label: string; value: string }

const when = (iso: string) => `${tashkentDdMm(iso)}, ${tashkentHhmm(iso)}`;
const callLine = (c: TaskSourceCall, t: Translate) => {
  // The outcome names are msg()-style texts the payments pages already translate.
  const info = CALL_OUTCOME_INFO[c.outcome];
  const outcome = info ? t(info.label) : c.outcome;
  return `${when(c.at)} · ${outcome} · ${c.by}${c.note ? ` — «${c.note}»` : ""}`;
};

/** The card's rows: who, phone, money, the calls; for a lead, where it came from and when. Labels in the page language (`t`, Uzbek by default); names, phones and notes are data. */
export function sourceFacts(source: TaskSource, t: Translate = uzbek): SourceFact[] {
  const out: SourceFact[] = [];
  const som = (amount: number) => t("{amount} so'm", { amount: formatPrice(amount) });
  if (source.student) {
    const s = source.student;
    out.push(
      { label: t("O'quvchi"), value: s.name },
      { label: t("Telefon"), value: formatPhone(s.phone) },
      { label: t("Qarz"), value: s.debt > 0 ? som(s.debt) : t("Qarz yo'q") },
    );
    if (source.promise) {
      const p = source.promise;
      const until = t("{date} gacha", { date: tashkentDdMm(p.date) });
      out.push({ label: t("Va'da"), value: p.amount ? `${until} · ${som(p.amount)}` : until });
      if (p.comment) out.push({ label: t("Va'da izohi"), value: p.comment });
    }
    if (source.previousCall) out.push({ label: t("Qayta qo'ng'iroq so'ralgan"), value: callLine(source.previousCall, t) });
    out.push({ label: t("Oxirgi qo'ng'iroq"), value: s.lastCall ? callLine(s.lastCall, t) : t("Qo'ng'iroq qilinmagan") });
  }
  if (source.lead) {
    const l = source.lead;
    out.push(
      { label: t("Lid"), value: l.name },
      { label: t("Telefon"), value: formatPhone(l.phone) },
      { label: t("Manba"), value: l.source ?? t("Ko'rsatilmagan") },
      { label: t("Kelgan sana"), value: when(l.createdAt) },
    );
  }
  return out;
}
