import { monthShort } from "@/components/payments/salary-utils";
import { formatDdMmYyyy, tashkentHhmm, tashkentWallClock } from "@/lib/tashkent-time";
import type { GateState } from "./bot-report-types";

/** An answer kept by `keepPreviousData` from another month, page or size is never drawn as the current one. */
export const settled = <T,>(data: T | undefined, isPlaceholderData: boolean): T | undefined =>
  isPlaceholderData ? undefined : data;

/** «70%» — the server's whole percent, never worked out here. */
export const rateText = (rate: number): string => `${rate}%`;

/** The line under «Shulardan a'zo bo'ldi». */
export const joinedHint = (blocked: number, rate: number): string =>
  blocked > 0 ? `${rateText(rate)} to'xtatilganlardan` : "to'xtatilgan odam yo'q";

/** «Sentabrda bot to'xtatgan odamlar»: every Uzbek month name takes «-da». */
export const cohortTitle = (month: string): string => `${monthShort(month)}da bot to'xtatgan odamlar`;

export const STATE_LABEL: Record<GateState, string> = {
  waiting: "Kutilmoqda",
  joined: "A'zo",
  left: "Chiqib ketgan",
};

/** The `Badge` variant of a state. */
export function stateTone(state: GateState): "default" | "secondary" | "destructive" {
  if (state === "joined") return "default";
  if (state === "left") return "destructive";
  return "secondary";
}

/** «dd.MM.yyyy, HH:mm» on the Tashkent clock; an empty instant is a dash. */
export function dateTime(iso: string | null): string {
  if (!iso) return "—";
  const day = tashkentWallClock(iso).toISOString().slice(0, 10);
  return `${formatDdMmYyyy(day)}, ${tashkentHhmm(iso)}`;
}
