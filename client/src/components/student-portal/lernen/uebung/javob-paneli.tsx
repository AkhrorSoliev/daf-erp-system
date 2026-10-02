import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";
import { DeWort } from "./de-wort";
import { javobPaneliMatni } from "./natija-xabari";

/**
 * The panel under a checked question, for every format but the pairing
 * ones. What it says comes from `javobPaneliMatni`.
 */
export function JavobPaneli({ natija }: { natija: PruefErgebnis }) {
  const { sarlavha, izoh, soz } = javobPaneliMatni(natija);
  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3",
        natija.isCorrect ? "bg-success/10" : "bg-danger/10",
      )}
    >
      <p
        className={cn(
          "font-bold",
          natija.isCorrect ? "text-success" : "text-danger",
        )}
      >
        {sarlavha}
      </p>
      {soz ? (
        <p className="mt-0.5 text-sm font-semibold text-ink-800">
          {izoh ? <span className="mr-1 text-ink-500">{izoh}</span> : null}
          <DeWort text={soz} />
        </p>
      ) : null}
    </div>
  );
}
