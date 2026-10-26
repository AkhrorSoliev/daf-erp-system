"use client";

import * as React from "react";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "./lumio";
import { Dafi } from "./lernen/dafi/dafi";
import { KAM_HARAKAT_MEDIA, harakatniSaqla, kamHarakatHozir } from "./lernen/harakat/kam-harakat";

const KONFETI = ["bg-coral-500", "bg-amber-500", "bg-teal-500", "bg-sky-500", "bg-grape-500", "bg-coral-500"] as const;

/** A real right-answer moment: Dafi cheers and confetti falls, or he stands still and nothing moves. */
function Sahna({ kam }: { kam: boolean }) {
  const t = useT();
  const [tetik, setTetik] = React.useState(0);

  // Replay the cheer so the student can watch it more than once.
  React.useEffect(() => {
    if (kam) return;
    const id = window.setInterval(() => setTetik((n) => n + 1), 2800);
    return () => window.clearInterval(id);
  }, [kam]);

  return (
    <div className="relative flex h-32 flex-col items-center justify-end overflow-hidden rounded-2xl bg-coral-500/10 pb-3">
      {kam ? null : (
        <div aria-hidden className="absolute inset-x-0 top-2 flex justify-around">
          {KONFETI.map((rang, i) => (
            <span
              key={i}
              className={cn("size-2.5 rounded-full motion-safe:animate-bounce", rang)}
              style={{ animationDelay: `${i * 140}ms`, marginTop: i % 2 ? 10 : 0 }}
            />
          ))}
        </div>
      )}
      <Dafi holat="bayram" olcham="sm" tetik={tetik} kam={kam} />
      <span className="font-display text-sm font-extrabold text-ink-900">{t("To'g'ri!")}</span>
    </div>
  );
}

export interface HarakatDialogiProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The student's own choice changed (the row behind the dialog redraws). */
  onChange: () => void;
}

/**
 * «Kam harakat»: two windows side by side, each showing a real moment of a
 * lesson with that setting. Tapping a window picks it.
 */
export function HarakatDialogi({ open, onOpenChange, onChange }: HarakatDialogiProps) {
  const t = useT();
  const [kam, setKam] = React.useState(false);
  const [tizim, setTizim] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setKam(kamHarakatHozir());
    setTizim(window.matchMedia(KAM_HARAKAT_MEDIA).matches);
  }, [open]);

  const tanla = (yangi: boolean) => {
    harakatniSaqla(yangi);
    setKam(kamHarakatHozir());
    onChange();
  };

  const oynalar = [
    { kam: false, nom: t("Oddiy"), izoh: t("To'g'ri javobda konfeti uchadi, Dafi sakraydi, bloklar silliq paydo bo'ladi.") },
    { kam: true, nom: t("Kam harakat"), izoh: t("Konfeti, sakrashlar va silliq o'tishlar o'chadi: ekran tinch turadi.") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio flex max-h-[90dvh] flex-col gap-0 overflow-hidden bg-surface p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-line px-5 py-4 text-left">
          <DialogTitle className="font-display text-xl font-extrabold text-ink-900">{t("Kam harakat")}</DialogTitle>
          <DialogDescription className="text-sm font-semibold text-ink-500">
            {t("Bitta to'g'ri javob ikkala holatda qanday ko'rinishi shu yerda. Birini bosing.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div role="radiogroup" aria-label={t("Kam harakat")} className="grid gap-3 sm:grid-cols-2">
            {oynalar.map((o) => {
              const tanlangan = o.kam === kam;
              return (
                <button
                  key={o.nom}
                  type="button"
                  role="radio"
                  aria-checked={tanlangan}
                  onClick={() => tanla(o.kam)}
                  className={cn(
                    "space-y-2.5 rounded-2xl border-2 p-3 text-left transition-colors",
                    tanlangan ? "border-coral-500 bg-coral-500/15" : "border-line bg-surface",
                  )}
                >
                  <Sahna kam={o.kam} />
                  <span className="flex items-center justify-between font-display font-extrabold text-ink-900">
                    {o.nom}
                    {tanlangan ? <Check size={18} weight="bold" className="text-coral-600 dark:text-coral-400" /> : null}
                  </span>
                  <span className="block text-xs font-semibold leading-snug text-ink-600">{o.izoh}</span>
                </button>
              );
            })}
          </div>
          {tizim ? (
            <p className="mt-3 text-xs font-semibold leading-snug text-ink-500">
              {t("Telefoningiz sozlamasida «kam harakat» yoqilgan, shuning uchun u doim ishlaydi.")}
            </p>
          ) : null}
        </div>
        <div className="border-t border-line px-5 py-3">
          <Button type="button" variant="secondary" className="w-full" onClick={() => onOpenChange(false)}>
            {t("Yopish")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
