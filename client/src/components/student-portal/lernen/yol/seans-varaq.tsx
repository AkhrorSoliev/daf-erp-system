"use client";

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
  return (
    <BottomSheet open={tugun != null} onOpenChange={(o) => !o && onYopish()} title={tugun?.matn}>
      {tugun?.ostyozuv ? <p className="mb-4 text-sm font-semibold text-ink-500">{tugun.ostyozuv}</p> : null}
      <Button className="w-full" onClick={onBoshlash}>
        {t("Boshlash")}
      </Button>
    </BottomSheet>
  );
}
