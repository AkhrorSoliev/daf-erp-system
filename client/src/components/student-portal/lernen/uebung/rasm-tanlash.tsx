"use client";

import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";

export interface RasmTanlashProps {
  /** Picture URLs — the answer is not among the props. */
  options: string[];
  tanlangan: string | null;
  onTanla: (v: string) => void;
  natija: PruefErgebnis | null;
  /** Same lock as `Tanlash`: the answer sent must not change while checked. */
  kutilmoqda?: boolean;
}

/**
 * Picture options for `BILD_WORT` / `AUDIO_BILD`: a 2×2 grid that fits a
 * phone. `alt` never names the word, or a screen reader would read the
 * answer out; the number in the corner is the desktop keyboard shortcut.
 */
export function RasmTanlash({
  options,
  tanlangan,
  onTanla,
  natija,
  kutilmoqda = false,
}: RasmTanlashProps) {
  return (
    <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-3">
      {options.map((url, i) => {
        const bosilgan = tanlangan === url;
        const togri = natija != null && url === natija.richtig;
        const xatoTanlov = natija != null && bosilgan && !natija.isCorrect;
        return (
          <button
            key={url}
            type="button"
            disabled={natija != null || kutilmoqda}
            onClick={() => onTanla(url)}
            aria-pressed={bosilgan}
            className={cn(
              "relative aspect-square w-full overflow-hidden rounded-2xl border-4 bg-white transition-colors",
              "border-transparent",
              bosilgan && !natija && "border-coral-500",
              togri && "border-success",
              xatoTanlov && "border-danger",
              (natija != null || kutilmoqda) && "cursor-default",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${i + 1}-variant`}
              className="size-full object-cover"
              draggable={false}
            />
            <span className="absolute left-2 top-2 hidden size-6 items-center justify-center rounded-full bg-black/40 text-xs font-bold text-white lg:flex">
              {i + 1}
            </span>
            {togri ? (
              <CheckCircle
                size={28}
                weight="fill"
                className="absolute right-2 top-2 rounded-full bg-white text-success"
              />
            ) : xatoTanlov ? (
              <XCircle
                size={28}
                weight="fill"
                className="absolute right-2 top-2 rounded-full bg-white text-danger"
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The single picture a `BILD_TIPPEN` question asks about. */
export function SavolRasmi({ url }: { url: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt="Savoldagi rasm"
      className="mx-auto aspect-square w-full max-w-64 rounded-2xl bg-white object-cover"
      draggable={false}
    />
  );
}
