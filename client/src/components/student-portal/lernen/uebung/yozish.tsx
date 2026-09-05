"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

export interface YozishProps {
  qiymat: string;
  onYoz: (v: string) => void;
  natija: PruefErgebnis | null;
  /** Enter bosilganda — desktopda tekshirish/keyingi. */
  onEnter: () => void;
}

const UMLAUT = ["ä", "ö", "ü", "ß"];

/**
 * Kirish maydoni orqali javob yozish: faqat `LUECKE`.
 *
 * TO'G'RI JAVOB PROPS'DA YO'Q — `mc-exercise.tsx` va `Tanlash` dagi
 * qoida shu yerda ham amal qiladi.
 */
export function Yozish({ qiymat, onYoz, natija, onEnter }: YozishProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  // Savol almashganda maydon o'zi fokuslanadi: aks holda o'quvchi har
  // savolda maydonni qo'li bilan bosishi kerak bo'lardi.
  React.useEffect(() => {
    if (!natija) ref.current?.focus();
  }, [natija]);

  return (
    <div className="space-y-3">
      <input
        ref={ref}
        value={qiymat}
        disabled={natija != null}
        onChange={(e) => onYoz(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onEnter();
          }
        }}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder="Javobingiz"
        className={cn(
          "w-full rounded-2xl border-2 bg-tint px-4 py-3.5 text-lg font-semibold text-ink-900 outline-none",
          "border-transparent focus:border-coral-500",
          natija?.isCorrect && "border-success bg-success/10 text-success",
          natija != null && !natija.isCorrect && "border-danger bg-danger/10 text-danger",
        )}
      />
      {natija == null ? (
        <div className="flex gap-2">
          {UMLAUT.map((ch) => (
            <button
              key={ch}
              type="button"
              onClick={() => {
                onYoz(qiymat + ch);
                ref.current?.focus();
              }}
              className="h-10 w-10 rounded-xl bg-tint font-semibold text-ink-700"
            >
              {ch}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
