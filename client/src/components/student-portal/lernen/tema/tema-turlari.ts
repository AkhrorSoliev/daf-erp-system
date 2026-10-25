import type * as React from "react";
import type { LernenTemaId } from "@/lib/lernen-temalar";

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

/**
 * What a theme supplies to the Ta'lim path (ADR-0125). A theme only DRAWS: the
 * path, locks, points and the exercise flow are the same in every theme.
 */
export interface LernenTema {
  id: LernenTemaId;
  TugunBelgisi: React.ComponentType<TugunBelgisiProps>;
}
