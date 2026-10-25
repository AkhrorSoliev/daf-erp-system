"use client";

import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";
import { DeWort } from "./de-wort";
import { XATO_SARLAVHASI } from "./javob-ohangi";
import { javobPaneliMatni } from "./natija-xabari";

/**
 * The verdict under a checked question, for every format but the pairing
 * ones. What it says comes from `javobPaneliMatni`; the tint is the bottom
 * bar's own (`PastkiPanel` `ohang`), so this draws only the words.
 */
export function JavobPaneli({ natija }: { natija: PruefErgebnis }) {
  const t = useT();
  const { sarlavha, izoh, soz } = javobPaneliMatni(natija, t);
  return (
    <div>
      <p
        className={cn(
          "font-display text-lg font-extrabold",
          natija.isCorrect ? "text-artikel-das" : XATO_SARLAVHASI,
        )}
      >
        {sarlavha}
      </p>
      {soz ? (
        <p className="mt-0.5 text-sm font-semibold text-ink-800">
          {izoh ? <span className="mr-1 text-ink-600">{izoh}</span> : null}
          <DeWort text={soz} />
        </p>
      ) : null}
    </div>
  );
}
