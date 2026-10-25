"use client";

import * as React from "react";
import { Check, SpeakerHigh, Wind } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { TAYYOR_TEMALAR } from "@/lib/lernen-temalar";
import { Card, ListRow, Section } from "./lumio";
import { useLernenTema } from "./lernen/tema/use-lernen-tema";
import { ovozChal, ovozniUygot } from "./lernen/ovoz/ovoz";
import { ovozYoqilganmi, ovozniSaqla } from "./lernen/ovoz/ovoz-sozlama";
import { harakatniSaqla, qurilmaHarakatSozlamasi } from "./lernen/harakat/kam-harakat";

/**
 * Settings → «Ta'lim ko'rinishi» (ADR-0125): the look is the account's choice;
 * sound and reduced motion are this device's. Only finished looks are offered.
 */
export function LernenKorinishTanlash() {
  const t = useT();
  const { id, tanla } = useLernenTema();
  const [ovoz, setOvoz] = React.useState(true);
  const [kam, setKam] = React.useState(false);

  React.useEffect(() => {
    setOvoz(ovozYoqilganmi());
    setKam(qurilmaHarakatSozlamasi() === true);
  }, []);

  return (
    <Section title={t("Ta'lim ko'rinishi")}>
      <Card pad="sm">
        <div role="radiogroup" aria-label={t("Ta'lim ko'rinishi")} className="grid gap-2">
          {TAYYOR_TEMALAR.map((tema) => {
            const tanlangan = tema.id === id;
            return (
              <button
                key={tema.id}
                type="button"
                role="radio"
                aria-checked={tanlangan}
                onClick={() => void tanla(tema.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors",
                  tanlangan ? "border-coral-500 bg-coral-100" : "border-line bg-surface",
                )}
              >
                <span aria-hidden className="size-8 shrink-0 rounded-full" style={{ background: tema.swatch }} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display font-extrabold text-ink-900">{t(tema.label)}</span>
                  <span className="block text-xs font-semibold text-ink-500">{t(tema.hint)}</span>
                </span>
                {tanlangan ? <Check size={20} weight="bold" className="text-coral-600" /> : null}
              </button>
            );
          })}
        </div>
      </Card>

      <ListRow
        icon={<SpeakerHigh weight="bold" />}
        iconTone="amber"
        label={t("Ovozlar")}
        subtitle={ovoz ? t("Yoqilgan") : t("O'chiq")}
        chevron={false}
        onClick={() => {
          const yangi = !ovoz;
          ovozniSaqla(yangi);
          setOvoz(yangi);
          if (yangi) {
            ovozniUygot();
            ovozChal("togri"); // a sample, so the student hears what they switched on
          }
        }}
      />
      <ListRow
        icon={<Wind weight="bold" />}
        iconTone="sky"
        label={t("Kam harakat")}
        subtitle={kam ? t("Yoqilgan") : t("O'chiq")}
        chevron={false}
        onClick={() => {
          const yangi = !kam;
          harakatniSaqla(yangi);
          setKam(yangi);
        }}
      />
    </Section>
  );
}
