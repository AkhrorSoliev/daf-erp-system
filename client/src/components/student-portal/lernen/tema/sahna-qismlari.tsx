"use client";

import type * as React from "react";
import { Check, LockSimple, Play, Star } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { MukofotFoniProps, TugunBelgisiProps, TugunHolat, UnitJoyiProps } from "./tema-turlari";

/**
 * A theme that stands a scene (ADR-0132, ADR-0133). Its id names its CSS
 * classes (`<id>-ring`, `<id>-bob`, `<id>-burst` in globals.css) and its reward
 * tokens (`--<id>-mukofot-ust`, `--<id>-mukofot-ost`, `--<id>-mukofot-nur`,
 * `--<id>-tepalik` in `.lumio` and `.dark .lumio`).
 */
export type SahnaTemaId = Exclude<LernenTemaId, "toza">;

/** An orb's look in one state: its fill, its shadow and glow, its glyph's colour. */
export interface SharRangi {
  fon: string;
  soya: string;
  belgi: string;
}

export interface SharTugunProps extends TugunBelgisiProps {
  tema: SahnaTemaId;
  shar: Record<TugunHolat, SharRangi>;
  /** The current node's ring (a `box-shadow`); it breathes through the theme's `<id>-ring` class. */
  halqa: string;
}

/**
 * A scene theme's path node: an orb per state, the current one wearing a
 * breathing ring (transform and opacity only). A locked node is still a button
 * — the student gets the soft "locked" answer — but it says it is closed to
 * screen readers. The name sits on a plain surface pill, positioned so it
 * paints above the ring, readable over any part of the scene.
 *
 * Under «Kam harakat» the ring rests at `opacity: 0`, so the current node must
 * not lean on it: each theme's `shar` gives it its own fill and glow, and the
 * star glyph tells it apart from the check and the lock.
 */
export function SharTugun({ tema, shar, halqa, label, holat, onClick, onBosilmagan }: SharTugunProps) {
  const t = useT();
  const locked = holat === "locked";
  const rang = shar[holat];
  const Icon = holat === "done" ? Check : holat === "active" ? Star : LockSimple;
  return (
    <div data-tugun={tema} className="flex flex-col items-center gap-1.5">
      <div className="relative">
        {holat === "active" ? (
          <span aria-hidden className={`${tema}-ring absolute inset-0 rounded-full`} style={{ boxShadow: halqa }} />
        ) : null}
        <button
          type="button"
          onClick={locked ? onBosilmagan : onClick}
          aria-label={locked ? t("{label} — hali ochilmagan", { label }) : label}
          aria-disabled={locked || undefined}
          className={cn(
            "relative grid size-[68px] place-items-center rounded-full transition-transform",
            locked ? "cursor-default border border-white/60" : "hover:-translate-y-0.5 active:scale-95",
          )}
          style={{ background: rang.fon, boxShadow: rang.soya, color: rang.belgi }}
        >
          <Icon size={28} weight="fill" />
        </button>
      </div>
      <span className="relative max-w-[120px] truncate rounded-full bg-surface px-2.5 py-0.5 text-center text-xs font-bold text-ink-900 shadow-lumio-sm">
        {label}
      </span>
    </div>
  );
}

/** A place's emblem: a small, still SVG. */
export interface BelgiProps {
  className?: string;
}

/** A theme's look of its place cards. */
export interface JoyKorinishi {
  /** The light behind the emblem, per state. */
  nur: Record<TugunHolat, string>;
  /** The corner badge, per state (each theme's contrast test holds each pair to 3:1). */
  nishon: Record<TugunHolat, { fon: string; rang: string }>;
  /** What covers a locked place's emblem (fog, murk), without a backdrop blur. */
  tuman: string;
  /** The «Boshlash» pill and the current place's 2 px ring (white text 4.5:1 on it). */
  accent: string;
  /** The current place's glow outside the ring (a `box-shadow`). */
  faolNur: string;
}

export interface SahnaJoyProps extends UnitJoyiProps {
  tema: SahnaTemaId;
  /** The place's id (`data-joy`), from the theme's `placeForKind`. */
  joy: string;
  Belgi: (p: BelgiProps) => React.JSX.Element;
  korinish: JoyKorinishi;
}

/**
 * One lesson as a place in a scene (spec §8), alternating sides down the page.
 * The current place glows, its emblem breathes (`<id>-bob`) and it offers
 * «Boshlash»; a locked one is covered, stays a button (the short "locked"
 * sound) and tells screen readers it is closed. The card is a 90% surface
 * (`CARD_SURFACE_ALPHA`) with no backdrop blur: the scene moves under it on
 * every scroll frame.
 */
export function SahnaJoy({
  tema,
  joy,
  Belgi,
  korinish,
  label,
  holat,
  izoh,
  tartib,
  onClick,
  onBosilmagan,
}: SahnaJoyProps) {
  const t = useT();
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
      style={joriy ? { boxShadow: `0 0 0 2px ${korinish.accent}, ${korinish.faolNur}` } : undefined}
    >
      <span aria-hidden className="relative grid size-20 shrink-0 place-items-center">
        <span className="absolute -inset-3 rounded-full" style={{ background: korinish.nur[holat] }} />
        <Belgi className={cn("relative size-16", joriy && `${tema}-bob`, qulf && "opacity-60 grayscale")} />
        {qulf ? (
          <span data-tuman="" className="absolute inset-0 rounded-full" style={{ background: korinish.tuman }} />
        ) : null}
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
            style={{ background: korinish.accent }}
          >
            {t("Boshlash")}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn("absolute top-3 grid size-7 place-items-center rounded-full", ongda ? "left-3" : "right-3")}
        style={{ background: korinish.nishon[holat].fon, color: korinish.nishon[holat].rang }}
      >
        <Nishon size={14} weight="bold" />
      </span>
    </button>
  );
}

/**
 * A scene theme's reward background (ADR-0128): the theme's light around the
 * reward, its ground at the bottom (`--<id>-tepalik`) and, for a celebration, a
 * slow sunburst (`<id>-burst`: rotation only, still under «Kam harakat»). The
 * colours are the theme's `.lumio` tokens, so the result's ink-900 heading and
 * ink-600 line keep 4.5:1. The sound, the confetti and Dafi are not the theme's.
 *
 * The 640 px sunburst is wider than the card, so the clip lives on a
 * decoration layer BEHIND the content. Nothing on the content path may clip:
 * Dafi's celebration hops lift it well above the card's top padding.
 */
export function SahnaMukofotFoni({ tema, bayram, children }: MukofotFoniProps & { tema: SahnaTemaId }) {
  return (
    <div data-mukofot={tema} className="relative px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-[28px]"
        style={{
          background: `radial-gradient(circle at 50% 30%, var(--${tema}-mukofot-ust), var(--${tema}-mukofot-ost) 75%)`,
        }}
      >
        {bayram ? (
          <div
            className={`${tema}-burst absolute size-[640px]`}
            style={{
              left: "calc(50% - 320px)",
              top: "calc(30% - 320px)",
              background: `repeating-conic-gradient(from 0deg, var(--${tema}-mukofot-nur) 0deg 10deg, transparent 10deg 30deg)`,
              maskImage: "radial-gradient(closest-side, #000, transparent)",
              WebkitMaskImage: "radial-gradient(closest-side, #000, transparent)",
            }}
          />
        ) : null}
        <div
          className="absolute inset-x-0 bottom-0 h-1/3"
          style={{ background: `radial-gradient(ellipse at 50% 100%, var(--${tema}-tepalik), transparent 70%)` }}
        />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}
