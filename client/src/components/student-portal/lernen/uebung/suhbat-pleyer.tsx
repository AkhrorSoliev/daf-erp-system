"use client";

import * as React from "react";
import { Pause, Play, ArrowClockwise } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { ovozXatosiMi } from "./oynatish-xatosi";
import { formatVaqt } from "./pleyer-vaqt";

/** O'quvchi tanlaydigan ikki tezlik — dizayn Q3: sekin variant faylsiz. */
const TEZLIKLAR = [1, 0.8] as const;

/**
 * Suhbat pleyeri — `HOEREN_WAHL` uchun.
 *
 * `OvozTugmasi` bir soniyalik so'z uchun («TO'LIQ PLEYER EMAS»); 40
 * soniyalik suhbatga pauza, vaqt chizig'i va tezlik kerak. Cheksiz
 * qayta eshitish; avtomatik boshlanadi (o'quvchi seansni tugma bosib
 * ochgan — brauzer ruxsat beradi; bermasa tugma qoladi, `catch`).
 *
 * `key={url}` — `OvozTugmasi`dagi bilan bir xil sabab: savol almashganda
 * eski `<audio>` tuguni butunlay olib tashlanadi, eski `error`/`play`
 * hodisalari yangi savolga tegmaydi.
 */
export function SuhbatPleyer({ url }: { url: string }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const [oynayapti, setOynayapti] = React.useState(false);
  const [vaqt, setVaqt] = React.useState(0);
  const [davomiylik, setDavomiylik] = React.useState(0);
  const [tezlik, setTezlik] = React.useState<(typeof TEZLIKLAR)[number]>(1);
  const [xato, setXato] = React.useState(false);
  // `ovoz-tugmasi.tsx`dagi bilan bir xil himoya, bir xil sabab bilan:
  // `.play()` va'dasi DOM tuguniga emas, bir martalik JS obyektiga
  // bog'liq — tez pauza/qayta bosish eski urinishni "havoda" qoldirishi
  // mumkin, va uning KECH kelgan rad etilishi ENDIGI (muvaffaqiyatli)
  // urinishning holatini buzmasligi kerak.
  const joriyUrinish = React.useRef(0);

  const qoy = React.useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const urinish = ++joriyUrinish.current;
    setXato(false);
    void a.play().catch((sabab: unknown) => {
      if (joriyUrinish.current !== urinish) return;
      // `AbortError` (pauza/manba almashishi to'xtatdi) va `NotAllowedError`
      // (avtomatik ijro bloklandi) HAQIQIY xato emas — qarang
      // `oynatish-xatosi.ts`.
      if (ovozXatosiMi(sabab)) setXato(true);
    });
  }, []);

  React.useEffect(() => {
    qoy();
  }, [url, qoy]);

  React.useEffect(() => {
    const a = audioRef.current;
    if (a) a.playbackRate = tezlik;
  }, [tezlik, url]);

  const togla = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) qoy();
    else a.pause();
  };

  const sur = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Number(e.target.value);
    setVaqt(a.currentTime);
  };

  return (
    // `data-suhbat-pleyer` — `seans-ekrani.tsx`dagi global Enter ushlagichi
    // shu belgi orqali pleyer ichidagi tugmani (Play, "0.8×") tanib, o'z
    // `preventDefault()`ini bosilmasin deb qaytarib yuboradi.
    <div
      data-suhbat-pleyer=""
      className="space-y-3 rounded-2xl border border-line bg-surface p-4"
    >
      <audio
        key={url}
        ref={audioRef}
        src={url}
        preload="auto"
        onPlay={() => setOynayapti(true)}
        onPause={() => setOynayapti(false)}
        onEnded={() => setOynayapti(false)}
        onTimeUpdate={(e) => setVaqt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDavomiylik(e.currentTarget.duration);
          e.currentTarget.playbackRate = tezlik;
        }}
        onError={() => setXato(true)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={togla}
          aria-label={
            xato ? "Ovozni qayta yuklash" : oynayapti ? "Pauza" : "Eshitish"
          }
          className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 motion-reduce:transition-none"
        >
          {xato ? (
            <ArrowClockwise size={26} weight="bold" />
          ) : oynayapti ? (
            <Pause size={26} weight="fill" />
          ) : (
            <Play size={26} weight="fill" />
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <input
            type="range"
            min={0}
            max={davomiylik || 0}
            step={0.1}
            value={Math.min(vaqt, davomiylik || 0)}
            onChange={sur}
            aria-label="Suhbatning joyi"
            className="w-full accent-primary"
          />
          <div className="flex items-center justify-between text-xs tabular-nums text-ink-500">
            <span>{formatVaqt(vaqt)}</span>
            <span>{formatVaqt(davomiylik)}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {TEZLIKLAR.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTezlik(t)}
            aria-pressed={tezlik === t}
            className={cn(
              "rounded-full px-3 py-1 text-sm font-semibold transition-colors",
              tezlik === t
                ? "bg-coral-500/10 text-coral-500"
                : "bg-tint text-ink-600",
            )}
          >
            {t === 1 ? "1×" : "🐢 0.8×"}
          </button>
        ))}
      </div>
      {xato ? (
        <p className="text-sm text-muted-foreground">
          Ovoz yuklanmadi — qayta urinib ko&apos;ring
        </p>
      ) : null}
    </div>
  );
}
