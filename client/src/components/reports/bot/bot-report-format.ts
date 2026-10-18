import { msg } from "@/i18n/msg";
import { interpolate } from "@/i18n/translate";
import { formatDdMmYyyy, tashkentHhmm, tashkentWallClock } from "@/lib/tashkent-time";
import type { Translate } from "@/components/notifications/notification-view";
import { capitalize, monthLocative } from "@/components/reports/departed-students/departed-format";
import type { GateState } from "./bot-report-types";

/** An answer kept by `keepPreviousData` from another month, page or size is never drawn as the current one. */
export const settled = <T,>(data: T | undefined, isPlaceholderData: boolean): T | undefined =>
  isPlaceholderData ? undefined : data;

/** «70%» — the server's whole percent, never worked out here. */
export const rateText = (rate: number): string => `${rate}%`;

/** The line under «Shulardan a'zo bo'ldi». */
export const joinedHint = (blocked: number, rate: number, t: Translate = interpolate): string =>
  blocked > 0 ? t("{rate} to'xtatilganlardan", { rate: rateText(rate) }) : t("to'xtatilgan odam yo'q");

/** «Sentabrda bot to'xtatgan odamlar»: the month in the locative, then the sentence capitalised. */
export const cohortTitle = (month: string, t: Translate = interpolate): string =>
  capitalize(t("{period} bot to'xtatgan odamlar", { period: monthLocative(month, t) }));

/** The client's words for the server's state codes (one person's row, so never a plural). */
export const STATE_LABEL: Record<GateState, string> = {
  waiting: msg("Hali a'zo emas"),
  joined: msg("A'zo"),
  left: msg("Chiqib ketgan"),
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
