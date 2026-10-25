import { javobHolati, type DafiHolat } from "../dafi/dafi-holat";
import type { PruefErgebnis } from "../types";
import type { SinovHolati } from "./sinov-natijasi";

/**
 * A checked answer's sound and Dafi's state (spec §9). A wrong answer is the
 * soft miss: a gentle sound and Dafi's sympathetic face, never a buzzer.
 */
export function javobEffekti(isCorrect: boolean): { ovoz: "togri" | "xato"; dafi: DafiHolat } {
  return { ovoz: isCorrect ? "togri" : "xato", dafi: javobHolati(isCorrect) };
}

export interface NatijaHissiyoti {
  /** The reward sound (once), the confetti and Dafi's three hops. */
  bayram: boolean;
  dafi: DafiHolat;
}

/**
 * How the result screen feels (ADR-0128). An ordinary lesson and a review
 * always celebrate. A final test celebrates only once the SERVER says it was
 * passed — the client never guesses from its own count (`sinov-natijasi.ts`).
 * While the server decides Dafi thinks; a failed attempt gets the soft miss;
 * a request that failed is not the student's doing, so he stays calm.
 */
export function natijaHissiyoti(sinov: SinovHolati | null | undefined): NatijaHissiyoti {
  if (!sinov) return { bayram: true, dafi: "bayram" };
  if (sinov.tur === "kutilmoqda") return { bayram: false, dafi: "oylayapti" };
  if (sinov.tur === "xato") return { bayram: false, dafi: "tinch" };
  return sinov.natija.bestanden ? { bayram: true, dafi: "bayram" } : { bayram: false, dafi: "xato" };
}

/** The result card's accuracy: whole percent of right answers, 0 for an empty session. */
export function aniqlikFoizi(togri: number, jami: number): number {
  return jami > 0 ? Math.round((togri / jami) * 100) : 0;
}

/**
 * The bottom bar's tint after a check. A pairing question ends only when the
 * whole board is green, so a first-try slip there is not painted amber: the
 * panel only says the question will come back.
 */
export function panelOhangi(
  natija: Pick<PruefErgebnis, "isCorrect"> | null,
  juftlash: boolean,
): "togri" | "xato" | null {
  if (!natija) return null;
  if (natija.isCorrect) return "togri";
  return juftlash ? null : "xato";
}
