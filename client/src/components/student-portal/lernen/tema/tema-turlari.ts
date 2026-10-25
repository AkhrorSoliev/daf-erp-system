import type * as React from "react";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { DafLevel } from "../types";

export const TUGUN_TONLARI = ["coral", "amber", "teal", "sky", "grape"] as const;
export type TugunTone = (typeof TUGUN_TONLARI)[number];
export type TugunHolat = "done" | "active" | "locked";

export interface TugunBelgisiProps {
  /** The section's own name; also the accessible name. */
  label: string;
  holat: TugunHolat;
  tone: TugunTone;
  /** Open the lesson sheet (not given for a node that cannot be opened). */
  onClick?: () => void;
  /** The student pressed a locked node: the caller plays the "locked" sound. */
  onBosilmagan?: () => void;
}

export interface MukofotFoniProps {
  /**
   * The result is a celebration (a lesson or a review done, a final test
   * passed); a theme may draw its own reward scene for it. The sound, the
   * confetti and Dafi are not the theme's.
   */
  bayram: boolean;
  children: React.ReactNode;
}

export interface UnitLavhaProps {
  daraja: DafLevel;
  /** «A1 · Essen und Trinken»: data, drawn as it comes. */
  matn: string;
}

/**
 * What a theme supplies to Ta'lim (ADR-0125, ADR-0128). A theme only DRAWS:
 * the path, locks, points, the exercise screen, the confetti and the
 * sound/Dafi decisions are the same in every theme.
 */
export interface LernenTema {
  id: LernenTemaId;
  TugunBelgisi: React.ComponentType<TugunBelgisiProps>;
  /** The result screen's background around Dafi, the heading and the cards. */
  MukofotFoni: React.ComponentType<MukofotFoniProps>;
  /** The unit page's header. */
  UnitLavha: React.ComponentType<UnitLavhaProps>;
}
