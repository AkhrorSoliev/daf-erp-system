import type { LogCallPrefill } from "@/components/outreach/log-call-dialog";
import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import type { TaskDetail, TaskSource, TaskSourceCall } from "@/hooks/use-tasks";
import { formatPhone, formatPrice } from "@/lib/format-utils";
import type { Can } from "@/lib/permission-check";
import { tashkentDdMm, tashkentHhmm } from "@/lib/tashkent-time";
import { taskEntityHref } from "./task-href";
import { isOpenStatus } from "./task-labels";

export const CALL_ACTION = "Qo'ng'iroqni yozish";
export const LEAD_ACTION = "Lidni ochish";

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
const callLine = (c: TaskSourceCall) =>
  `${when(c.at)} · ${CALL_OUTCOME_INFO[c.outcome]?.label ?? c.outcome} · ${c.by}${c.note ? ` — «${c.note}»` : ""}`;

/** The card's rows: who, phone, money, the calls; for a lead, where it came from and when. */
export function sourceFacts(source: TaskSource): SourceFact[] {
  const out: SourceFact[] = [];
  if (source.student) {
    const s = source.student;
    out.push(
      { label: "O'quvchi", value: s.name },
      { label: "Telefon", value: formatPhone(s.phone) },
      { label: "Qarz", value: s.debt > 0 ? `${formatPrice(s.debt)} so'm` : "Qarz yo'q" },
    );
    if (source.promise) {
      const p = source.promise;
      out.push({ label: "Va'da", value: `${tashkentDdMm(p.date)} gacha${p.amount ? ` · ${formatPrice(p.amount)} so'm` : ""}` });
      if (p.comment) out.push({ label: "Va'da izohi", value: p.comment });
    }
    if (source.previousCall) out.push({ label: "Qayta qo'ng'iroq so'ralgan", value: callLine(source.previousCall) });
    out.push({ label: "Oxirgi qo'ng'iroq", value: s.lastCall ? callLine(s.lastCall) : "Qo'ng'iroq qilinmagan" });
  }
  if (source.lead) {
    const l = source.lead;
    out.push(
      { label: "Lid", value: l.name },
      { label: "Telefon", value: formatPhone(l.phone) },
      { label: "Manba", value: l.source ?? "Ko'rsatilmagan" },
      { label: "Kelgan", value: when(l.createdAt) },
    );
  }
  return out;
}
