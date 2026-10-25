"use client";

import * as React from "react";
import { kamHarakatHozir } from "../harakat/kam-harakat";

const SANOQ_DAVOMIYLIGI = 600;

/**
 * A value that counts up from zero to `maqsad` in about 600 ms
 * (`requestAnimationFrame`). Under less motion (system or the device's
 * switch) it shows the final value at once: the number matters, not its rise.
 * `null` until there is a target.
 */
export function useSanaladiganBall(maqsad: number | null): number | null {
  const [qiymat, setQiymat] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (maqsad == null) {
      setQiymat(null);
      return;
    }

    if (kamHarakatHozir() || maqsad === 0) {
      setQiymat(maqsad);
      return;
    }

    const boshi = performance.now();
    let frameId: number;

    const kadr = (hozir: number) => {
      const foiz = Math.min(1, (hozir - boshi) / SANOQ_DAVOMIYLIGI);
      setQiymat(Math.round(foiz * maqsad));
      if (foiz < 1) {
        frameId = requestAnimationFrame(kadr);
      }
    };
    frameId = requestAnimationFrame(kadr);
    return () => cancelAnimationFrame(frameId);
  }, [maqsad]);

  return qiymat;
}
