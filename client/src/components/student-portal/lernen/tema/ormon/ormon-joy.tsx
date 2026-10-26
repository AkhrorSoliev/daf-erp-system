"use client";

import { Check, LockSimple, Play } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { TugunHolat, UnitJoyiProps } from "../tema-turlari";
import { ACCENT } from "./ormon-biom";
import { JOY_BELGISI, placeForKind } from "./ormon-joy-belgilari";

/** The light behind the emblem, per state (ormon2.html `.pl::before`, `.pl.done`, `.pl.cur`). */
const NUR: Record<TugunHolat, string> = {
  done: "radial-gradient(closest-side, rgba(255, 233, 162, 0.8), rgba(255, 233, 162, 0))",
  active: "radial-gradient(closest-side, rgba(166, 253, 232, 0.85), rgba(166, 253, 232, 0))",
  locked: "radial-gradient(closest-side, rgba(255, 255, 255, 0.45), rgba(255, 255, 255, 0))",
};

/** The corner badge, per state (ormon2.html `.pl .bd`); `ormon-kontrast.test.ts` holds each pair to 3:1. */
export const NISHON: Record<TugunHolat, { fon: string; rang: string }> = {
  done: { fon: "#f2cd7a", rang: "#5a3d10" },
  active: { fon: "#86ead2", rang: "#0d4a3d" },
  locked: { fon: "var(--bg-sunk)", rang: "var(--ink-600)" },
};

/** Fog over a locked place's emblem (ormon2.html `.pl.lock::after`), without a backdrop blur. */
const TUMAN =
  "radial-gradient(ellipse at 50% 55%, rgba(255, 255, 255, 0.75), rgba(255, 255, 255, 0.2) 70%, rgba(255, 255, 255, 0))";

/**
 * «O'rmon»: one lesson as a place in the forest (spec §8) — a hut, a bridge, a
 * cave or a castle by the lesson's step, alternating sides down the page. The
 * current place glows, its emblem breathes and it offers «Boshlash»; a locked
 * one is covered in fog, stays a button (the short "locked" sound) and tells
 * screen readers it is closed. The card is a 90% surface with no backdrop
 * blur: the scene moves under it on every scroll frame.
 */
export function OrmonJoy({ label, kind, holat, izoh, tartib, onClick, onBosilmagan }: UnitJoyiProps) {
  const t = useT();
  const joy = placeForKind(kind);
  const Belgi = JOY_BELGISI[joy];
  const qulf = holat === "locked";
  const joriy = holat === "active";
  const ongda = tartib % 2 === 1;
  const Nishon = holat === "done" ? Check : joriy ? Play : LockSimple;
  return (
    <button
      type="button"
      data-joy={joy}
      onClick={qulf ? onBosilmagan : onClick}
      aria-disabled={qulf || undefined}
      aria-label={qulf ? t("{label} — hali ochilmagan", { label }) : undefined}
      className={cn(
        "relative flex w-full items-center gap-4 rounded-[28px] bg-surface/90 px-5 py-4 text-left shadow-lumio-card transition-transform",
        ongda && "flex-row-reverse text-right",
        qulf ? "cursor-default" : "hover:-translate-y-0.5 active:translate-y-[3px]",
      )}
      style={joriy ? { boxShadow: `0 0 0 2px ${ACCENT}, 0 0 40px rgba(166, 253, 232, 0.4)` } : undefined}
    >
      <span aria-hidden className="relative grid size-20 shrink-0 place-items-center">
        <span className="absolute -inset-3 rounded-full" style={{ background: NUR[holat] }} />
        <Belgi className={cn("relative size-16", joriy && "ormon-bob", qulf && "opacity-60 grayscale")} />
        {qulf ? <span data-tuman="" className="absolute inset-0 rounded-full" style={{ background: TUMAN }} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        {/* The corner badge (12px in, 28px wide) ends 40px from the card's edge, 20px into this column (the card pads 20px): 24px keeps a long name clear of it. */}
        <span
          className={cn(
            "block truncate font-display text-lg font-extrabold text-ink-900",
            ongda ? "pl-6" : "pr-6",
          )}
        >
          {label}
        </span>
        {izoh ? (
          <span className="block truncate text-xs font-semibold text-[var(--amber-ink)]">{izoh}</span>
        ) : null}
        {joriy ? (
          <span
            className="mt-1.5 inline-block rounded-full px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide text-white"
            style={{ background: ACCENT }}
          >
            {t("Boshlash")}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn("absolute top-3 grid size-7 place-items-center rounded-full", ongda ? "left-3" : "right-3")}
        style={{ background: NISHON[holat].fon, color: NISHON[holat].rang }}
      >
        <Nishon size={14} weight="bold" />
      </span>
    </button>
  );
}
