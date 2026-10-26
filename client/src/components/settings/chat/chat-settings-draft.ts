import type { Translate } from "@/components/notifications/notification-view";
import { interpolate } from "@/i18n/translate";
import type { ChatAdminSettings, ChatAdminSettingsPatch } from "./chat-admin-types";

/** Minutes are text, so an emptied field is not silently 0. */
export interface ChatSettingsDraft {
  enabled: boolean;
  active: string;
  radio: string;
}

export function toDraft(s: ChatAdminSettings): ChatSettingsDraft {
  return { enabled: s.enabled, active: String(s.weekMinutesActive), radio: String(s.weekMinutesRadio) };
}

/** Same ends as the server: whole minutes 0–1000. */
function minutes(text: string): number | null {
  if (!/^\d{1,4}$/.test(text.trim())) return null;
  const n = Number(text);
  return n <= 1000 ? n : null;
}

export function isDirty(saved: ChatAdminSettings, d: ChatSettingsDraft): boolean {
  const base = toDraft(saved);
  return d.enabled !== base.enabled || d.active !== base.active || d.radio !== base.radio;
}

/** The first thing wrong with the draft, or null. */
export function draftError(d: ChatSettingsDraft, t: Translate = interpolate): string | null {
  if (minutes(d.active) === null) {
    return t("Mashq daqiqalari 0 dan 1000 gacha butun son bo'lishi kerak");
  }
  if (minutes(d.radio) === null) {
    return t("Radio daqiqalari 0 dan 1000 gacha butun son bo'lishi kerak");
  }
  return null;
}

/** Only what changed; null = nothing to save. */
export function draftPatch(saved: ChatAdminSettings, d: ChatSettingsDraft): ChatAdminSettingsPatch | null {
  const patch: ChatAdminSettingsPatch = {};
  if (d.enabled !== saved.enabled) patch.enabled = d.enabled;
  const active = minutes(d.active);
  if (active !== null && active !== saved.weekMinutesActive) patch.weekMinutesActive = active;
  const radio = minutes(d.radio);
  if (radio !== null && radio !== saved.weekMinutesRadio) patch.weekMinutesRadio = radio;
  return Object.keys(patch).length > 0 ? patch : null;
}
