"use client";

import * as React from "react";
import { useT } from "@/i18n/use-t";
import { BottomSheet, Button } from "../../lumio";

export interface SeansVaraqProps {
  /** The pressed node; `null` keeps the sheet shut. */
  tugun: { matn: string; ostyozuv: string | null } | null;
  onYopish: () => void;
  onBoshlash: () => void;
}

/** The sheet that rises from the bottom when a path node is pressed. */
export function SeansVaraq({ tugun, onYopish, onBoshlash }: SeansVaraqProps) {
  const t = useT();
  // The parent shuts the sheet by passing `null`, but the sheet stays mounted while it slides
  // out. Keep drawing the last node meanwhile, or the title and subtitle vanish mid-exit.
  const [oxirgi, setOxirgi] = React.useState(tugun);
  if (tugun != null && tugun !== oxirgi) setOxirgi(tugun);
  const korsatiladi = tugun ?? oxirgi;

  return (
    <BottomSheet open={tugun != null} onOpenChange={(o) => !o && onYopish()} title={korsatiladi?.matn}>
      {korsatiladi?.ostyozuv ? <p className="mb-4 text-sm font-semibold text-ink-500">{korsatiladi.ostyozuv}</p> : null}
      <Button className="w-full" onClick={onBoshlash}>
        {t("Boshlash")}
      </Button>
    </BottomSheet>
  );
}
