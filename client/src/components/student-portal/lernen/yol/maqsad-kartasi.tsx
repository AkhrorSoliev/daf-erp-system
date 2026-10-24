"use client";

import * as React from "react";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/use-t";
import { BottomSheet, ProgressRing } from "../../lumio";
import { useMaqsadOzgartir } from "../queries";
import { MAQSAD_VARIANTLARI, maqsadKartasi } from "../maqsad";
import type { Maqsad } from "../types";
import { qisqaRaqam } from "./yol-tuzilishi";

/**
 * Yo'l tepasidagi kunlik maqsad (spec S2 3.1): halqa (bugungi / maqsad),
 * sarlavha, ball va daraja nomi. Kartaning o'zi — yagona tugma: bosilsa
 * pastdan oynacha, uch daraja; tanlov darrov saqlanadi va oynacha yopiladi.
 * Bajarilmagan maqsad uchun jazo yo'q — halqa shunchaki to'lmaydi.
 * Halqa faqat bezak (`aria-hidden`): ma'no yonidagi matnda («40 / 80 ball»).
 */
export function MaqsadKartasi({ maqsad }: { maqsad: Maqsad }) {
  const [ochiq, setOchiq] = React.useState(false);
  const kartaRef = React.useRef<HTMLButtonElement>(null);
  const ozgartir = useMaqsadOzgartir();
  const t = useT();
  const k = maqsadKartasi(maqsad, t);
  const tolgan = k.holat !== "jarayon";

  return (
    <>
      <button
        ref={kartaRef}
        type="button"
        onClick={() => setOchiq(true)}
        className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3 py-2.5 text-left shadow-lumio-sm transition-transform active:translate-y-[1px]"
      >
        <span aria-hidden className="shrink-0">
          <ProgressRing
            value={k.foiz}
            size={52}
            stroke={7}
            className={tolgan ? "text-success" : "text-coral-500"}
            label={qisqaRaqam(maqsad.hozir)}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block font-display text-sm font-extrabold",
              tolgan ? "text-success" : "text-ink-900",
            )}
          >
            {k.sarlavha}
          </span>
          <span className="block text-sm font-semibold text-ink-600">{k.ballMatni}</span>
          <span className="block text-xs font-semibold text-ink-500">
            {t("{level} · o'zgartirish", { level: k.darajaNomi })}
          </span>
        </span>
      </button>

      <BottomSheet
        open={ochiq}
        onOpenChange={setOchiq}
        title={t("Kunlik maqsad")}
        onCloseAutoFocus={(e) => {
          // Fokus kartaga qaytadi: oynachada Tab/Escape bilan ishlagan
          // foydalanuvchi o'z joyidan ketmaydi.
          e.preventDefault();
          kartaRef.current?.focus();
        }}
      >
        <div className="space-y-2">
          {MAQSAD_VARIANTLARI.map((v) => {
            const tanlangan = v.daraja === maqsad.daraja;
            return (
              <button
                key={v.daraja}
                type="button"
                aria-pressed={tanlangan}
                disabled={ozgartir.isPending}
                onClick={() =>
                  ozgartir.mutate(v.daraja, {
                    onSuccess: () => setOchiq(false),
                    onError: (err) =>
                      toast.error(getErrorMessage(err, t("Saqlashda xatolik"))),
                  })
                }
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-card border px-4 py-3 text-left transition-colors disabled:opacity-50",
                  tanlangan ? "border-coral-500 bg-coral-500/8" : "border-line bg-surface",
                )}
              >
                <span>
                  <span className="block font-display font-extrabold text-ink-900">{t(v.nomi)}</span>
                  <span className="block text-xs font-semibold text-ink-500">{t(v.seans)}</span>
                </span>
                <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
                  {t("{n} ball", { n: v.ball })}
                </span>
              </button>
            );
          })}
        </div>
      </BottomSheet>
    </>
  );
}
