"use client";

import * as React from "react";
import { HARAKAT_OZGARDI, KAM_HARAKAT_MEDIA, kamHarakatHozir } from "./kam-harakat";

/** `false` on the server and the first paint, then the real answer (no hydration mismatch). */
export function useKamHarakat(): boolean {
  const [kam, setKam] = React.useState(false);
  React.useEffect(() => {
    const yangila = () => setKam(kamHarakatHozir());
    yangila();
    const mq = window.matchMedia(KAM_HARAKAT_MEDIA);
    mq.addEventListener("change", yangila);
    window.addEventListener("storage", yangila);
    window.addEventListener(HARAKAT_OZGARDI, yangila);
    return () => {
      mq.removeEventListener("change", yangila);
      window.removeEventListener("storage", yangila);
      window.removeEventListener(HARAKAT_OZGARDI, yangila);
    };
  }, []);
  return kam;
}
