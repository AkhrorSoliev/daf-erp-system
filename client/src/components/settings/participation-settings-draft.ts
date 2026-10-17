export type AppLevel = "A1" | "A2" | "B1";

export interface ParticipationSettings {
  minAttendancePercent: number;
  minAppPercent: Record<AppLevel, number>;
}

export interface ParticipationSettingsPatch {
  minAttendancePercent?: number;
  minAppPercent?: Partial<Record<AppLevel, number>>;
}

/** The form holds text, so a half-typed number never becomes NaN in state. */
export interface ParticipationDraft {
  attendance: string;
  A1: string;
  A2: string;
  B1: string;
}

export const APP_LEVELS: AppLevel[] = ["A1", "A2", "B1"];

export function toDraft(s: ParticipationSettings): ParticipationDraft {
  return {
    attendance: String(s.minAttendancePercent),
    A1: String(s.minAppPercent.A1),
    A2: String(s.minAppPercent.A2),
    B1: String(s.minAppPercent.B1),
  };
}

function wholePercent(text: string): number | null {
  if (!/^\d{1,3}$/.test(text.trim())) return null;
  const n = Number(text);
  return n >= 0 && n <= 100 ? n : null;
}

/** The first thing wrong with the draft, in Uzbek, or null. */
export function draftError(d: ParticipationDraft): string | null {
  if (wholePercent(d.attendance) === null) {
    return "Davomat chegarasi 0 dan 100 gacha butun son bo'lishi kerak";
  }
  for (const level of APP_LEVELS) {
    if (wholePercent(d[level]) === null) {
      return `${level} uchun ilova chegarasi 0 dan 100 gacha butun son bo'lishi kerak`;
    }
  }
  return null;
}

/** Only what changed, so an untouched number is never rewritten; null = nothing to save. */
export function draftPatch(
  saved: ParticipationSettings,
  d: ParticipationDraft,
): ParticipationSettingsPatch | null {
  const patch: ParticipationSettingsPatch = {};
  const attendance = wholePercent(d.attendance);
  if (attendance !== null && attendance !== saved.minAttendancePercent) {
    patch.minAttendancePercent = attendance;
  }
  const apps: Partial<Record<AppLevel, number>> = {};
  for (const level of APP_LEVELS) {
    const value = wholePercent(d[level]);
    if (value !== null && value !== saved.minAppPercent[level]) apps[level] = value;
  }
  if (Object.keys(apps).length > 0) patch.minAppPercent = apps;
  return Object.keys(patch).length > 0 ? patch : null;
}
