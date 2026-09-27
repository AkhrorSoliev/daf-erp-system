import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

/**
 * The panel under a checked question, for every format but the pairing
 * ones. A picture choice's `richtig` is a picture URL, so the word comes
 * from `loesungWort` — shown after a correct answer too, because the
 * student may have found the picture without knowing the word yet.
 */
export function JavobPaneli({ natija }: { natija: PruefErgebnis }) {
  const soz = natija.isCorrect
    ? natija.loesungWort
    : (natija.loesungWort ?? natija.richtig);
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
        {natija.isCorrect ? "To'g'ri!" : "Xato"}
      </p>
      {soz ? (
        <p className="mt-0.5 text-sm font-semibold text-ink-800">{soz}</p>
      ) : null}
    </div>
  );
}
