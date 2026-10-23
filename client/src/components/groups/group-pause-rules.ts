import { format, parse } from "date-fns";

/** The pause a group is in now, as `GET /groups` sends it (ADR-0119). */
export interface GroupPauseInfo {
  plannedResumeOn: string | null;
  resumeOn: string | null;
}

/** What the admin has entered in the pause / resume part of the status dialog. */
export interface PauseChoice {
  day: Date | undefined;
  /** "Hozircha noma'lum": the restart day is not known yet (a pause only). */
  unknown: boolean;
}

export const EMPTY_PAUSE_CHOICE: PauseChoice = { day: undefined, unknown: false };

export type PauseMode = "pause" | "resume";

/** Pausing an active group, or opening a paused one; null for any other change. */
export function pauseMode(current: string, selected: string): PauseMode | null {
  if (selected === "PAUSED" && current !== "PAUSED") return "pause";
  if (current === "PAUSED" && selected === "ACTIVE") return "resume";
  return null;
}

/** 'YYYY-MM-DD' as a local-midnight Date, the shape `DatePicker` holds. */
export function dayFromApi(day: string | null | undefined): Date | undefined {
  return day ? parse(day, "yyyy-MM-dd", new Date()) : undefined;
}

/** The day to offer first when opening a paused group: what was said before. */
export function resumePrefill(info: GroupPauseInfo | null | undefined): Date | undefined {
  return dayFromApi(info?.resumeOn ?? info?.plannedResumeOn);
}

/**
 * A pause needs a restart day or "noma'lum", never both and never neither; a
 * resume needs the day. Mirrors the server's `decidePauseChange`.
 */
export function pauseChoiceReady(mode: PauseMode | null, c: PauseChoice): boolean {
  if (mode === "pause") return (c.day !== undefined) !== c.unknown;
  if (mode === "resume") return c.day !== undefined;
  return true;
}

/** The fields the status call carries for this choice. */
export function pausePayload(mode: PauseMode | null, c: PauseChoice) {
  if (mode === "pause") {
    return c.unknown || !c.day
      ? { resumeUnknown: true }
      : { plannedResumeOn: format(c.day, "yyyy-MM-dd") };
  }
  if (mode === "resume" && c.day) return { resumeOn: format(c.day, "yyyy-MM-dd") };
  return {};
}

/** Tomorrow at local midnight: a planned restart day is after today. */
export function tomorrow(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
}

/** Today at local midnight: a resume cannot name a day that has passed. */
export function today(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
