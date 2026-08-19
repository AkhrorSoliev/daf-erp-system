"use client";

import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  ArrowClockwise,
  CircleNotch,
  X,
} from "../lumio/icon";
import { TILE_TONE } from "../lumio/tones";
import { categoryOf } from "@/lib/radio-stations";
import { useRadio } from "../lib/radio-store";
import { useSidebar, PLAYER_INSET } from "../lib/sidebar-store";
import { LiveBars } from "./live-bars";

/**
 * The player docked over the portal shell. Present on every `/portal/*` screen
 * once a station is chosen, which is the whole point: a student browses their
 * schedule or payments with German still playing.
 *
 * Deliberately small. It answers "what is playing / is it working / stop it",
 * and defers everything else (station switching, volume, favourites) to the
 * expanded sheet a tap away. A dock crowded with controls competes with the
 * page it sits on.
 */
export function RadioMiniPlayer() {
  const stationId = useRadio((s) => s.stationId);
  const status = useRadio((s) => s.status);
  const toggle = useRadio((s) => s.toggle);
  const retry = useRadio((s) => s.retry);
  const stop = useRadio((s) => s.stop);
  const setExpanded = useRadio((s) => s.setExpanded);
  const station = useRadio((s) => s.station());
  const sidebarMode = useSidebar((s) => s.mode);

  if (!stationId || !station) return null;

  const category = categoryOf(station.category);
  const Icon = category.icon;
  const playing = status === "playing";
  const loading = status === "loading";
  const failed = status === "error";

  const statusLine = failed
    ? "Ulanib bo'lmadi"
    : loading
      ? "Ulanmoqda..."
      : playing
        ? "Jonli efir"
        : "To'xtatilgan";

  return (
    <div
      className={cn(
        // Mobile: floats just above the bottom-nav pill, matching its inset and
        // width so the two read as one stack rather than two loose islands.
        "fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-40 mx-auto max-w-[520px] transition-[left] duration-200 ease-out",
        // Tablet + desktop: sits in the bottom-left gutter, clearing whatever
        // width the side rail currently has.
        "md:inset-x-auto md:bottom-5 md:mx-0 md:w-[380px] md:max-w-none",
        PLAYER_INSET[sidebarMode],
      )}
    >
      <div className="glass flex items-center gap-3 rounded-[22px] border border-line/70 bg-surface/90 py-2 pl-2 pr-2.5 shadow-lumio-pop">
        {/* Station identity — opens the full player. */}
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl py-1 pl-1 pr-1 text-left transition-colors hover:bg-tint"
          aria-label={`${station.name} — to'liq playerni ochish`}
        >
          <span
            className={cn(
              "relative inline-flex size-11 shrink-0 items-center justify-center rounded-card",
              TILE_TONE[category.tone],
            )}
          >
            <Icon size={22} weight="fill" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[15px] font-extrabold leading-tight text-ink-900">
              {station.name}
            </span>
            <span
              className={cn(
                "mt-0.5 flex items-center gap-1.5 text-xs font-bold leading-none",
                failed ? "text-danger" : playing ? "text-coral-600" : "text-ink-500",
              )}
            >
              {playing ? <LiveBars active /> : null}
              {statusLine}
            </span>
          </span>
        </button>

        {failed ? (
          <button
            type="button"
            onClick={retry}
            aria-label="Qayta ulanish"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-danger/12 text-danger transition-colors hover:bg-danger/20"
          >
            <ArrowClockwise size={20} weight="bold" />
          </button>
        ) : (
          <button
            type="button"
            onClick={toggle}
            aria-label={playing || loading ? "To'xtatish" : "Eshitish"}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-coral-500 text-white shadow-lumio-sm transition-transform active:scale-95"
          >
            {loading ? (
              <CircleNotch size={20} weight="bold" className="animate-spin" />
            ) : playing ? (
              <Pause size={20} weight="fill" />
            ) : (
              <Play size={20} weight="fill" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={stop}
          aria-label="Radioni yopish"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 transition-colors hover:bg-tint hover:text-ink-700"
        >
          <X size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
