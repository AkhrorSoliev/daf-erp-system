"use client";

import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";
import { XATO_BELGISI, XATO_CHEGARASI } from "./javob-ohangi";
import { Uhr } from "./uhr";

export interface UhrTanlashProps {
  /** Clock times `HH:MM` — the answer is not among the props. */
  options: string[];
  tanlangan: string | null;
  onTanla: (v: string) => void;
  natija: PruefErgebnis | null;
  /** Same lock as `Tanlash`: the answer sent must not change while checked. */
  kutilmoqda?: boolean;
}

/**
 * Four clocks for `UHR_HOEREN`, a 2×2 grid like `RasmTanlash`. Each clock
 * is labelled by its number only, never by its time; the number in the
 * corner is the desktop keyboard shortcut.
 */
export function UhrTanlash({
  options,
  tanlangan,
  onTanla,
  natija,
  kutilmoqda = false,
}: UhrTanlashProps) {
  const t = useT();
  return (
    <div className="mx-auto grid w-full max-w-sm grid-cols-2 gap-3">
      {options.map((zeit, i) => {
        const bosilgan = tanlangan === zeit;
        const togri = natija != null && zeit === natija.richtig;
        const xatoTanlov = natija != null && bosilgan && !natija.isCorrect;
        return (
          <button
            key={zeit}
            type="button"
            disabled={natija != null || kutilmoqda}
            onClick={() => onTanla(zeit)}
            aria-pressed={bosilgan}
            aria-label={t("{n}-variant", { n: i + 1 })}
            className={cn(
              "relative w-full rounded-2xl border-4 bg-tint p-3 text-ink-900 transition-colors",
              "border-transparent",
              bosilgan && !natija && "border-coral-500",
              togri && "border-success",
              xatoTanlov && XATO_CHEGARASI,
              (natija != null || kutilmoqda) && "cursor-default",
            )}
          >
            <Uhr zeit={zeit} label={t("{n}-variant", { n: i + 1 })} className="w-full" />
            <span className="absolute left-2 top-2 hidden size-6 items-center justify-center rounded-full bg-black/40 text-xs font-bold text-white lg:flex">
              {i + 1}
            </span>
            {togri ? (
              <CheckCircle size={28} weight="fill" className="absolute right-2 top-2 rounded-full bg-white text-success" />
            ) : xatoTanlov ? (
              <XCircle size={28} weight="fill" className={cn("absolute right-2 top-2 rounded-full bg-white", XATO_BELGISI)} />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
