"use client";

import * as React from "react";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LERNEN_TEMALAR } from "@/lib/lernen-temalar";
import { Badge, Button } from "./lumio";
import { Dafi } from "./lernen/dafi/dafi";
import { temaTop } from "./lernen/tema/tema-reyestri";
import { useLernenTema } from "./lernen/tema/use-lernen-tema";
import { TemaRasmi } from "./lernen-tema-rasmi";

/** The theme's own pieces, drawn on two screens of the lesson path so the pick is not a guess. */
function Misollar({ id }: { id: (typeof LERNEN_TEMALAR)[number]["id"] }) {
  const t = useT();
  const { TugunBelgisi, MukofotFoni } = temaTop(id);
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-500">{t("Yo'l")}</p>
        <div className="flex items-start justify-around rounded-2xl bg-sunk px-2 py-5">
          <TugunBelgisi label={t("Bajarilgan")} holat="done" tone="teal" />
          <TugunBelgisi label={t("Hozirgi")} holat="active" tone="coral" />
          <TugunBelgisi label={t("Yopiq")} holat="locked" tone="sky" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-ink-500">{t("Natija")}</p>
        <MukofotFoni bayram>
          <div className="flex flex-col items-center gap-1">
            <Dafi holat="bayram" olcham="sm" />
            <span className="font-display text-lg font-extrabold text-ink-900">{t("Dars tugadi!")}</span>
          </div>
        </MukofotFoni>
      </div>
    </div>
  );
}

export interface TemaDialogiProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * «Ta'lim ko'rinishi» (ADR-0125): the looks as cards, and under them the
 * chosen look drawn on real parts of the path and the result screen.
 * Looks that are not built yet are listed, greyed out, with «Tez orada».
 */
export function TemaDialogi({ open, onOpenChange }: TemaDialogiProps) {
  const t = useT();
  const { id, tanla } = useLernenTema();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="lumio flex max-h-[90dvh] flex-col gap-0 overflow-hidden bg-surface p-0 sm:max-w-md">
        <DialogHeader className="border-b border-line px-5 py-4 text-left">
          <DialogTitle className="font-display text-xl font-extrabold text-ink-900">{t("Ta'lim ko'rinishi")}</DialogTitle>
          <DialogDescription className="text-sm font-semibold text-ink-500">
            {t("Tanlangan ko'rinishda yo'l, mashq va natija ekranlari chiqadi. Istalgan vaqtda almashtirishingiz mumkin.")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <div role="radiogroup" aria-label={t("Ta'lim ko'rinishi")} className="grid gap-2">
            {LERNEN_TEMALAR.map((tema) => {
              const tanlangan = tema.id === id;
              const yopiq = !tema.tayyor;
              return (
                <button
                  key={tema.id}
                  type="button"
                  role="radio"
                  aria-checked={tanlangan}
                  aria-disabled={yopiq}
                  disabled={yopiq}
                  onClick={() => void tanla(tema.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors",
                    tanlangan ? "border-coral-500 bg-coral-500/15" : "border-line bg-surface",
                    yopiq && "cursor-not-allowed opacity-60",
                  )}
                >
                  <TemaRasmi id={tema.id} swatch={tema.swatch} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display font-extrabold text-ink-900">{t(tema.label)}</span>
                    <span className={cn("block text-xs font-semibold", tanlangan ? "text-ink-600" : "text-ink-500")}>{t(tema.hint)}</span>
                  </span>
                  {yopiq ? <Badge tone="neutral" size="sm">{t("Tez orada")}</Badge> : null}
                  {tanlangan ? <Check size={20} weight="bold" className="text-coral-600 dark:text-coral-400" /> : null}
                </button>
              );
            })}
          </div>
          <Misollar id={id} />
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
