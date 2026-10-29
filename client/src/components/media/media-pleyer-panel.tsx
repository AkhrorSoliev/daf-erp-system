"use client";

import * as React from "react";
import { Pause, Play, Repeat, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";
import { formatVaqt } from "@/components/student-portal/lernen/uebung/pleyer-vaqt";
import { joriyElement, useMediaPleyer } from "./media-pleyer";

const TEZLIKLAR = [1, 0.8] as const;

function yozuvMaydonimi(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}

/** /media pastidagi yagona player. Sahifadagi barcha karnaylar shu `<audio>`ni boshqaradi. */
export function MediaPleyerPanel() {
  const t = useT();
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const h = useMediaPleyer(
    useShallow((s) => ({
      navbat: s.navbat,
      joriyId: s.joriyId,
      ketmaKet: s.ketmaKet,
      tezlik: s.tezlik,
      ijroda: s.ijroda,
      amal: s.amal,
      ornat: s.ornat,
      qoyId: s.qoyId,
      almashtirish: s.almashtirish,
      keyingi: s.keyingi,
      oldingi: s.oldingi,
      tugashi: s.tugashi,
      setIjroda: s.setIjroda,
      setKetmaKet: s.setKetmaKet,
      setTezlik: s.setTezlik,
    })),
  );
  const joriy = joriyElement(h);
  const [vaqt, setVaqt] = React.useState(0);
  const [davomiylik, setDavomiylik] = React.useState(0);
  const [xato, setXato] = React.useState(false);

  // Buyruqlar: `amal.n` o'zgarganda bajariladi.
  React.useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (h.amal.tur === "toxtat") {
      a.pause();
      return;
    }
    if (h.amal.tur === "almashtir") {
      if (a.paused) void a.play().catch(() => setXato(true));
      else a.pause();
      return;
    }
    if (!joriy) return;
    setXato(false);
    if (a.src !== new URL(joriy.url, window.location.href).href) a.src = joriy.url;
    a.currentTime = 0;
    a.playbackRate = h.tezlik;
    void a.play().catch(() => setXato(true));
    document
      .querySelector(`[data-pleyer-id="${CSS.escape(joriy.id)}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Faqat yangi buyruq ishga tushiradi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h.amal.n]);

  React.useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = h.tezlik;
  }, [h.tezlik]);

  // Klaviatura: bo'sh joy — pauza/davom, ←/→ — 5 soniya. Sinov qatlami ochiq bo'lsa ishlamaydi.
  React.useEffect(() => {
    const bos = (e: KeyboardEvent) => {
      const a = audioRef.current;
      if (!a || !useMediaPleyer.getState().joriyId) return;
      if (yozuvMaydonimi(e.target) || document.body.dataset.mediaSinov === "1") return;
      if (e.key === " ") {
        e.preventDefault();
        useMediaPleyer.getState().almashtirish();
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        a.currentTime = Math.max(0, a.currentTime + (e.key === "ArrowRight" ? 5 : -5));
      }
    };
    window.addEventListener("keydown", bos);
    return () => window.removeEventListener("keydown", bos);
  }, []);

  const indeks = joriy ? h.navbat.findIndex((e) => e.id === joriy.id) : -1;

  return (
    <div className="sticky bottom-0 z-10 border-t bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => h.setIjroda(true)}
        onPause={() => h.setIjroda(false)}
        onEnded={() => {
          h.setIjroda(false);
          h.tugashi();
        }}
        onTimeUpdate={(e) => setVaqt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDavomiylik(e.currentTarget.duration)}
        onError={() => setXato(true)}
      />
      {!joriy ? (
        <p className="py-1.5 text-center text-sm text-muted-foreground">
          {t("Eshitish uchun karnayni bosing")}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <div className="flex items-center gap-1">
            <button type="button" onClick={h.oldingi} aria-label={t("Oldingisi")} className="rounded-md p-2 hover:bg-muted">
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              onClick={h.almashtirish}
              aria-label={h.ijroda ? t("Pauza") : t("Eshitish")}
              className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              {xato ? <RotateCcw className="size-4" /> : h.ijroda ? <Pause className="size-4" /> : <Play className="size-4" />}
            </button>
            <button type="button" onClick={h.keyingi} aria-label={t("Keyingisi")} className="rounded-md p-2 hover:bg-muted">
              <SkipForward className="size-4" />
            </button>
          </div>
          <div className="min-w-0 flex-1 basis-40">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{joriy.nom}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {indeks + 1} / {h.navbat.length}
              </span>
            </div>
            {xato ? (
              <p className="text-xs text-destructive">{t("Ovoz yuklanmadi")}</p>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums text-muted-foreground">{formatVaqt(vaqt)}</span>
                <input
                  type="range"
                  min={0}
                  max={davomiylik || 0}
                  step={0.1}
                  value={Math.min(vaqt, davomiylik || 0)}
                  onChange={(e) => {
                    const a = audioRef.current;
                    if (a) a.currentTime = Number(e.target.value);
                  }}
                  aria-label={t("Audio joyi")}
                  className="w-full accent-primary"
                />
                <span className="text-xs tabular-nums text-muted-foreground">{formatVaqt(davomiylik)}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {TEZLIKLAR.map((tz) => (
              <button
                key={tz}
                type="button"
                onClick={() => h.setTezlik(tz)}
                aria-pressed={h.tezlik === tz}
                className={cn(
                  "rounded-md border px-2 py-1 text-xs tabular-nums",
                  h.tezlik === tz ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                {tz === 1 ? "1×" : "0,8×"}
              </button>
            ))}
            <button
              type="button"
              onClick={() => h.setKetmaKet(!h.ketmaKet)}
              aria-pressed={h.ketmaKet}
              className={cn(
                "flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                h.ketmaKet ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              <Repeat className="size-3.5" />
              {t("Ketma-ket")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
