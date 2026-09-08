"use client";

import * as React from "react";
import { SpeakerHigh, ArrowClockwise } from "@phosphor-icons/react";

/**
 * Savolning ovozi — karnay tugmasi.
 *
 * TO'LIQ PLEYER EMAS (seyk bar, vaqt, pauza yo'q): so'z audiosi bir
 * soniyalik, ularning hammasi shovqin bo'lardi.
 *
 * AVTOMATIK QO'YISH ISHLAYDI: brauzer sahifa bilan muloqot bo'lmaguncha
 * ovozga ruxsat bermaydi, lekin o'quvchi seansni tugma bosib ochadi —
 * birinchi savol chiqqanda muloqot allaqachon bo'lgan. Shunga qaramay
 * `catch` bor: ruxsat berilmasa tugma qoladi va o'quvchi o'zi bosadi.
 *
 * CHEKSIZ QAYTA ESHITISH — A1 darajasida takror eshitish o'rganishning
 * bir qismi; chegaralash jazoga aylanardi.
 */
export function OvozTugmasi({ url }: { url: string }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [xato, setXato] = React.useState(false);

  const qoy = React.useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    setXato(false);
    a.currentTime = 0;
    void a.play().catch(() => setXato(true));
  }, []);

  // Savol almashganda (`url` o'zgaradi) o'zi yangraydi.
  React.useEffect(() => { qoy(); }, [url, qoy]);

  return (
    <div className="flex flex-col items-center gap-2">
      <audio ref={audioRef} src={url} preload="auto" onError={() => setXato(true)} />
      <button
        type="button"
        onClick={qoy}
        aria-label={xato ? "Ovozni qayta yuklash" : "Ovozni eshitish"}
        className="flex size-20 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 motion-reduce:transition-none"
      >
        {xato ? <ArrowClockwise size={36} weight="bold" /> : <SpeakerHigh size={36} weight="fill" />}
      </button>
      {xato ? (
        // Savol O'TKAZILMAYDI va ball yo'qotilmaydi — tarmoq muammosi
        // o'quvchining bilimi emas.
        <p className="text-sm text-muted-foreground">Ovoz yuklanmadi — qayta urinib ko&apos;ring</p>
      ) : null}
    </div>
  );
}
