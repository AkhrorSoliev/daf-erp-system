"use client";

import * as React from "react";
import { Palette, SpeakerHigh, Wind } from "@phosphor-icons/react";
import { useT } from "@/i18n/use-t";
import { LERNEN_TEMALAR } from "@/lib/lernen-temalar";
import { ListRow, Section } from "./lumio";
import { SozlamaQatori } from "./lernen-sozlama-qatori";
import { TemaDialogi } from "./lernen-tema-dialogi";
import { HarakatDialogi } from "./lernen-harakat-dialogi";
import { useLernenTema } from "./lernen/tema/use-lernen-tema";
import { ovozChal, ovozniUygot } from "./lernen/ovoz/ovoz";
import { ovozYoqilganmi, ovozniSaqla } from "./lernen/ovoz/ovoz-sozlama";
import { kamHarakatHozir } from "./lernen/harakat/kam-harakat";

/**
 * Settings → «Ta'lim» (ADR-0125): the look is the account's choice; sound and
 * reduced motion are this device's. The look and the motion each open a dialog
 * that shows what the choice does on a real part of a lesson.
 */
export function LernenKorinishTanlash() {
  const t = useT();
  const { id } = useLernenTema();
  const [ovoz, setOvoz] = React.useState(true);
  const [kam, setKam] = React.useState(false);
  const [temaOchiq, setTemaOchiq] = React.useState(false);
  const [harakatOchiq, setHarakatOchiq] = React.useState(false);

  React.useEffect(() => {
    setOvoz(ovozYoqilganmi());
    // The EFFECTIVE state (device switch OR system setting): a phone set to reduce motion shows «Yoqilgan».
    setKam(kamHarakatHozir());
  }, []);

  const tema = LERNEN_TEMALAR.find((x) => x.id === id);

  return (
    <Section title={t("Ta'lim")}>
      <ListRow
        icon={<Palette weight="bold" />}
        iconTone="grape"
        label={t("Ta'lim ko'rinishi")}
        subtitle={tema ? t(tema.label) : undefined}
        onClick={() => setTemaOchiq(true)}
      />

      <SozlamaQatori
        icon={<SpeakerHigh weight="bold" />}
        label={t("Ovozlar")}
        holat={ovoz ? t("Yoqilgan") : t("O'chiq")}
        yoqilgan={ovoz}
        onToggle={() => {
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
        onClick={() => setHarakatOchiq(true)}
      />

      <TemaDialogi open={temaOchiq} onOpenChange={setTemaOchiq} />
      <HarakatDialogi
        open={harakatOchiq}
        onOpenChange={setHarakatOchiq}
        onChange={() => setKam(kamHarakatHozir())}
      />
    </Section>
  );
}
