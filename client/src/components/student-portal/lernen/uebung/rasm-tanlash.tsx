"use client";

import { CheckCircle, XCircle } from "@phosphor-icons/react";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import type { PruefErgebnis } from "../types";
import { XATO_BELGISI, XATO_CHEGARASI } from "./javob-ohangi";

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
  const t = useT();
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
              xatoTanlov && XATO_CHEGARASI,
              (natija != null || kutilmoqda) && "cursor-default",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={t("{n}-variant", { n: i + 1 })}
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
                className="absolute right-2 top-2 rounded-full bg-surface text-artikel-das"
              />
            ) : xatoTanlov ? (
              <XCircle
                size={28}
                weight="fill"
                className={cn("absolute right-2 top-2 rounded-full bg-surface", XATO_BELGISI)}
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
  const t = useT();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={t("Savoldagi rasm")}
      className="mx-auto aspect-square w-full max-w-64 rounded-2xl bg-white object-cover"
      draggable={false}
    />
  );
}

/**
 * A dialog's story picture, across the content column: above a gap-fill
 * dialog, and at the top of the text after a listening answer. The box
 * keeps 4:3 before the file arrives, so the dialog below does not jump.
 */
export function SuhbatRasmi({ url, alt }: { url: string; alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="aspect-[4/3] w-full rounded-2xl bg-tint object-cover"
      draggable={false}
    />
  );
}
