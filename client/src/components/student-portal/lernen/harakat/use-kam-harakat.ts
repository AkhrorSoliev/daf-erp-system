"use client";

import * as React from "react";
import { kamHarakatHozir } from "./kam-harakat";

/** `false` on the server and the first paint, then the real answer (no hydration mismatch). */
export function useKamHarakat(): boolean {
  const [kam, setKam] = React.useState(false);
  React.useEffect(() => {
    const yangila = () => setKam(kamHarakatHozir());
    yangila();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    mq.addEventListener("change", yangila);
    window.addEventListener("storage", yangila);
    return () => {
      mq.removeEventListener("change", yangila);
      window.removeEventListener("storage", yangila);
    };
  }, []);
  return kam;
}
