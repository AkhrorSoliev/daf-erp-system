"use client";

import toast from "react-hot-toast";
import { getErrorMessage } from "@/lib/get-error-message";
import { cn } from "@/lib/utils";
import { Card } from "../../lumio";
import { useEslatmalarOzgartir, useFortschritt } from "../queries";
import {
  ESLATMA_IZOH,
  ESLATMA_SARLAVHA,
  SAQLANMADI,
  ULANMAGAN_IZOH,
  eslatmaHolati,
} from "../eslatma";

/**
 * «Darajam» tabida «Nishonlarim» ostida (spec S4 §7): «Telegram eslatmalari»,
 * almashtirgich va bir qatorli izoh. Bosish darrov saqlanadi (xato bo'lsa
 * xabar va eski holat — `eslatmalarMutation`). Saqlanayotganda almashtirgich
 * faol emas (ikki marta bosish poygasi). Botga ulanmagan o'quvchida «Botga
 * ulang» izohi, almashtirgich faol emas. Ma'lumot `fortschritt` so'rovidan —
 * alohida so'rov yo'q.
 */
export function EslatmalarQatori() {
  const { data } = useFortschritt();
  const ozgartir = useEslatmalarOzgartir();
  const holat = data ? eslatmaHolati(data) : null;
  if (!holat) return null;

  const yoqiq = data?.eslatmalar === true;
  const faol = holat !== "ulanmagan";

  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p id="eslatmalar-sarlavha" className="font-display text-sm font-extrabold text-ink-900">
          {ESLATMA_SARLAVHA}
        </p>
        <p id="eslatmalar-izoh" className="text-xs font-semibold text-ink-500">
          {faol ? ESLATMA_IZOH : ULANMAGAN_IZOH}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={yoqiq}
        aria-labelledby="eslatmalar-sarlavha"
        aria-describedby="eslatmalar-izoh"
        disabled={!faol || ozgartir.isPending}
        onClick={() =>
          ozgartir.mutate(!yoqiq, {
            onError: (err) => toast.error(getErrorMessage(err, SAQLANMADI)),
          })
        }
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral-500",
          yoqiq ? "bg-teal-500" : "bg-line",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1 left-0 h-5 w-5 rounded-full bg-white shadow transition-transform",
            yoqiq ? "translate-x-6" : "translate-x-1",
          )}
        />
      </button>
    </Card>
  );
}
