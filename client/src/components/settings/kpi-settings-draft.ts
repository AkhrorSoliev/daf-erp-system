import { ruleError, settingsPatch } from "@/components/reports/admin-kpi/kpi-format";
import type { Translate } from "@/components/notifications/notification-view";
import { interpolate } from "@/i18n/translate";
import type { KpiRuleMode, KpiSettings, KpiSettingsPatch } from "@/components/reports/admin-kpi/kpi-types";

/** A rule being edited: the number stays a string, so clearing the field does not snap it to 0. */
export interface DraftRule {
  mode: KpiRuleMode;
  text: string;
}

export interface KpiDraft {
  enabled: boolean;
  leadPaid: DraftRule;
  promiseKept: DraftRule;
}

const RULE_KEYS = ["leadPaid", "promiseKept"] as const;

export function toDraft(s: KpiSettings): KpiDraft {
  return {
    enabled: s.enabled,
    leadPaid: { mode: s.leadPaid.mode, text: String(s.leadPaid.value) },
    promiseKept: { mode: s.promiseKept.mode, text: String(s.promiseKept.value) },
  };
}

export function draftError(rule: DraftRule, t: Translate = interpolate): string | null {
  if (rule.text === "") return t("Qiymatni kiriting");
  return ruleError({ mode: rule.mode, value: Number(rule.text) }, t);
}

export function rangeHint(mode: KpiRuleMode, t: Translate = interpolate): string {
  return mode === "PERCENT" ? t("0 dan 100 gacha, butun foiz") : t("0 dan 10 000 000 so'mgacha");
}

/** What would be sent; empty while any field is invalid, so nothing half-typed goes out. */
export function draftPatch(saved: KpiSettings, draft: KpiDraft): KpiSettingsPatch {
  if (RULE_KEYS.some((key) => draftError(draft[key]) !== null)) return {};
  const parsed: KpiSettings = { ...saved, enabled: draft.enabled };
  for (const key of RULE_KEYS) {
    parsed[key] = { mode: draft[key].mode, value: Number(draft[key].text) };
  }
  return settingsPatch(saved, parsed);
}
