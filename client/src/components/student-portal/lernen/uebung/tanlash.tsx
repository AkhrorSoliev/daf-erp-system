"use client";

import * as React from "react";
import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

export interface TanlashProps {
  options: string[];
  tanlangan: string | null;
  onTanla: (v: string) => void;
  natija: PruefErgebnis | null;
  /**
   * `pruefen` javob kutmoqda: natija hali yo'q, lekin o'quvchi boshqa
   * variant bosib joriy yuborilgan javobni almashtirmasligi kerak —
   * aks holda ekrandagi rang serverga YUBORILGAN javobga emas, HOZIRGI
   * tanlovga qarab chizilardi.
   */
  kutilmoqda?: boolean;
}

/**
 * Variant tanlash: `WORT_UZ`, `UZ_WORT`, `ARTIKEL`, `SATZ_UEBERSETZEN`,
 * `REAKTION`.
 *
 * TO'G'RI JAVOB PROPS'DA YO'Q. U `natija` ichida, javob yuborilgandan
 * KEYIN keladi — `mc-exercise.tsx` dagi qoida shu yerda ham amal qiladi.
 */
export function Tanlash({ options, tanlangan, onTanla, natija, kutilmoqda = false }: TanlashProps) {
  // Qisqa variantlar planshet va desktopda ikki ustunda — artikl
  // savolida uchta so'z ekranning uchdan birini egallab turishi
  // bo'sh joyni behuda sarflardi.
  const qisqa = options.every((o) => o.length <= 14);

  return (
    <div className={cn("grid gap-2.5", qisqa ? "sm:grid-cols-2" : "grid-cols-1")}>
      {options.map((opt, i) => {
        const bosilgan = tanlangan === opt;
        const togri = natija != null && opt === natija.richtig;
        const xatoTanlov = natija != null && bosilgan && !natija.isCorrect;

        return (
          <button
            key={opt}
            type="button"
            disabled={natija != null || kutilmoqda}
            onClick={() => onTanla(opt)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-2xl border-2 px-4 py-3.5 text-left font-semibold transition-colors",
              "border-transparent bg-tint text-ink-800",
              bosilgan && !natija && "border-coral-500 bg-coral-500/10",
              togri && "border-success bg-success/10 text-success",
              xatoTanlov && "border-danger bg-danger/10 text-danger",
              (natija != null || kutilmoqda) && "cursor-default",
            )}
          >
            {/* Klaviatura raqami faqat desktopda ko'rinadi — telefonda
                bosiladigan raqam yo'q va u faqat chalg'itardi. */}
            <span className="hidden w-5 shrink-0 text-center text-sm text-ink-400 lg:inline">
              {i + 1}
            </span>
            {togri ? (
              <CheckCircle size={20} weight="fill" />
            ) : xatoTanlov ? (
              <XCircle size={20} weight="fill" />
            ) : null}
            <span className="min-w-0 flex-1">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
