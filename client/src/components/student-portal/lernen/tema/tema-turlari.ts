import type * as React from "react";
import type { LernenTemaId } from "@/lib/lernen-temalar";
import type { DafLessonKind, DafLevel } from "../types";

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
  /** The unit's order in its level (1-based): a theme with a scene tints its header by it (ADR-0131). */
  unitTartibi?: number;
}

/**
 * One lesson of the unit page drawn as a «place» (spec §8, ADR-0131). The page
 * has already decided everything — the name, the lock state, the words-left
 * caption; the theme only draws it.
 */
export interface UnitJoyiProps {
  /** The lesson's name in the path's words («Tanishuv»); also the accessible name. */
  label: string;
  /** The lesson's step in the unit (`null`: an old DiB lesson); a scene picks its place by it. */
  kind: DafLessonKind | null;
  holat: TugunHolat;
  tone: TugunTone;
  /** «Yana mashq qilish · N yangi so'z» under a finished section lesson, else `null`. */
  izoh: string | null;
  /** The place's position on the page (0-based): a scene may alternate sides by it. */
  tartib: number;
  onClick: () => void;
  /** A locked place was pressed: the caller plays the "locked" sound. */
  onBosilmagan: () => void;
}

/** The background a theme draws behind the path and the unit page (spec §5, ADR-0131). */
export interface SahnaProps {
  /** The order (1-based, within its level) of the unit the student is looking at; 1 while it is unknown. */
  unitTartibi: number;
}

/**
 * What a theme supplies to Ta'lim (ADR-0125, ADR-0128, ADR-0131). A theme only
 * DRAWS: the path, locks, points, the exercise screen, the confetti and the
 * sound/Dafi decisions are the same in every theme.
 */
export interface LernenTema {
  id: LernenTemaId;
  TugunBelgisi: React.ComponentType<TugunBelgisiProps>;
  /** The result screen's background around Dafi, the heading and the cards. */
  MukofotFoni: React.ComponentType<MukofotFoniProps>;
  /** The unit page's header. */
  UnitLavha: React.ComponentType<UnitLavhaProps>;
  /** A lesson of the unit page. */
  UnitJoyi: React.ComponentType<UnitJoyiProps>;
  /**
   * The scene behind the path and the unit page. The page draws it inside
   * `SahnaRamka` (fixed, behind the content, clear of the rail), also while
   * its data loads. Absent: the plain app background («Toza»).
   */
  Sahna?: React.ComponentType<SahnaProps>;
  /** The still picture on the theme's card in Settings; absent: the swatch dot. */
  Miniatyura?: React.ComponentType;
}
