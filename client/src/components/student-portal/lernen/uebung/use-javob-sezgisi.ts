"use client";

import * as React from "react";
import type { DafiHolat } from "../dafi/dafi-holat";
import { ovozChal } from "../ovoz/ovoz";
import { javobEffekti } from "./hissiyot";

export interface SeansDafi {
  holat: DafiHolat;
  /** Counts the verdicts, so the same state replays (`Dafi` `tetik`). */
  tetik: number;
}

/**
 * The exercise screen's feedback (ADR-0128): the verdict's sound and Dafi's
 * reaction. `javobKeldi` is called from the check's mutation callbacks, once
 * per verdict and once per pair; never from an effect and never on a network
 * error. `yangiSavol` puts Dafi back to thinking for the next question.
 */
export function useJavobSezgisi(): {
  dafi: SeansDafi;
  javobKeldi: (isCorrect: boolean) => void;
  yangiSavol: () => void;
} {
  const [dafi, setDafi] = React.useState<SeansDafi>({ holat: "oylayapti", tetik: 0 });

  // The sound engine is its own chunk and a session opens by URL too: load it
  // now, so on iOS/Telegram the unlock finds it ready inside the first tap.
  React.useEffect(() => {
    import("../ovoz/ovoz-motor").catch(() => {});
  }, []);

  const javobKeldi = React.useCallback((isCorrect: boolean) => {
    const e = javobEffekti(isCorrect);
    ovozChal(e.ovoz);
    setDafi((d) => ({ holat: e.dafi, tetik: d.tetik + 1 }));
  }, []);

  const yangiSavol = React.useCallback(() => {
    setDafi((d) => ({ holat: "oylayapti", tetik: d.tetik }));
  }, []);

  return { dafi, javobKeldi, yangiSavol };
}
