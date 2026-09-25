"use client";

import { cn } from "@/lib/utils";
import { ArrowClockwise, CircleNotch, Radio } from "../lumio/icon";
import { useRadio, type RadioStatus } from "../lib/radio-store";
import { LiveBars } from "./live-bars";

/**
 * The radio's control inside a lesson. The dock is not drawn there (the
 * lesson's own action bar owns the bottom edge, see `isExerciseSessionRoute`)
 * and nothing pauses the radio when a lesson clip plays, so this sits in the
 * lesson header: one tap stops or resumes the station.
 *
 * It shows the radio, never a pause glyph: next to the lesson's progress bar,
 * "pause" would read as pausing the lesson.
 */
export function RadioSessionToggle() {
  const station = useRadio((s) => s.station());
  const status = useRadio((s) => s.status);
  const toggle = useRadio((s) => s.toggle);
  const retry = useRadio((s) => s.retry);

  if (!station) return null;
  return (
    <RadioSessionButton
      name={station.name}
      status={status}
      onToggle={toggle}
      onRetry={retry}
    />
  );
}

/** What a tap does next, spoken after the station's name. */
const NEXT_STEP: Record<RadioStatus, string> = {
  playing: "to'xtatish",
  loading: "to'xtatish",
  idle: "eshitish",
  error: "qayta ulanish",
};

export function RadioSessionButton({
  name,
  status,
  onToggle,
  onRetry,
}: {
  name: string;
  status: RadioStatus;
  onToggle: () => void;
  onRetry: () => void;
}) {
  const failed = status === "error";
  const on = status === "playing" || status === "loading";
  const label = `${name} — ${NEXT_STEP[status]}`;

  return (
    <button
      type="button"
      onClick={failed ? onRetry : onToggle}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
        failed
          ? "bg-danger/12 text-danger hover:bg-danger/20"
          : on
            ? "bg-coral-500/12 text-coral-600 hover:bg-coral-500/20"
            : "text-ink-500 hover:bg-tint",
      )}
    >
      {failed ? (
        <ArrowClockwise size={18} weight="bold" />
      ) : status === "loading" ? (
        <CircleNotch size={18} weight="bold" className="animate-spin" />
      ) : status === "playing" ? (
        <LiveBars active />
      ) : (
        <Radio size={20} weight="bold" />
      )}
    </button>
  );
}
