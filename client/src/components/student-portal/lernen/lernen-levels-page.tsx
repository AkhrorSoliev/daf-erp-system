"use client";

import * as React from "react";

import {
  BookOpen,
  Headphones,
  Microphone,
  PencilSimple,
  Article,
} from "@phosphor-icons/react";
import {
  Screen,
  ScreenHeader,
  FadeIn,
  Card,
  Badge,
  IconTile,
  EmptyState,
  LoadingCards,
} from "../lumio";
import { cn } from "@/lib/utils";
import { msg } from "@/i18n/msg";
import { useT } from "@/i18n/use-t";
import { useLernenLevels } from "./queries";
import { loadState } from "../lib/load-state";
import { useSidebar } from "../lib/sidebar-store";
import { LoadFailed } from "../load-failed";
import { SAHNA_KARTASI, SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SahnaRamka } from "./tema/sahna-ramka";
import { useLernenTema } from "./tema/use-lernen-tema";
import { joriyUnitTartibi } from "./yol/joriy-unit";
import { LernenYol } from "./yol/lernen-yol";
import { YolTepasi } from "./yol/yol-tepasi";

/**
 * Goethe imtihonining to'rt moduli — o'quv yo'lining MAQSADI.
 *
 * Hozir ularning bittasi ham ishlamaydi: Hören uchun audio va transkript
 * bor, savollar yo'q; Lesen matnlari manbalarda yo'q; Schreiben va
 * Sprechen AI baholashni talab qiladi. Shunga qaramay ular ekranda
 * ko'rinadi va holati rost aytiladi.
 *
 * Yashirilsa, o'quvchi grammatika mashqlarini nima uchun yechayotganini
 * bilmaydi. Ishlaydigandek ko'rsatilsa, bosilganda bo'sh ekran chiqadi.
 */
const SKILLS = [
  {
    key: "hoeren",
    label: "Hören",
    sub: msg("Tinglash"),
    icon: Headphones,
    tone: "sky" as const,
  },
  {
    key: "lesen",
    label: "Lesen",
    sub: msg("O'qish"),
    icon: Article,
    tone: "teal" as const,
  },
  {
    key: "schreiben",
    label: "Schreiben",
    sub: msg("Yozish"),
    icon: PencilSimple,
    tone: "amber" as const,
  },
  {
    key: "sprechen",
    label: "Sprechen",
    sub: msg("Gapirish"),
    icon: Microphone,
    tone: "coral" as const,
  },
];

export function LernenLevelsPage() {
  const t = useT();
  const query = useLernenLevels();
  const { data } = query;
  const yolBosh = data != null && data.length === 0;
  const { tema } = useLernenTema();
  const Sahna = tema.Sahna;
  const sidebarMode = useSidebar((s) => s.mode);
  // The unit the student is scrolling through, told by the path: the scene follows it.
  const [korinayotganUnitId, setKorinayotganUnitId] = React.useState<number | null>(null);

  return (
    // `isolate` (only with a scene): the frame (-z-10) stays behind the page and above the shell's background.
    <Screen className={cn(Sahna && "isolate")}>
      {/* Independent of the path's request (spec §10): the scene stands while it loads or fails too. */}
      {Sahna ? (
        <SahnaRamka sidebarMode={sidebarMode}>
          <Sahna unitTartibi={joriyUnitTartibi(data, korinayotganUnitId)} />
        </SahnaRamka>
      ) : null}

      {/* Sarlavha tab nomi bilan bir xil. «Darslar» Asosiy sahifada markazdagi
          guruh darslarini anglatadi — bu yerda ishlatilsa, ikki joy bitta nom
          bilan chalkashadi. */}
      <ScreenHeader
        subtitle={t("Nemis tili")}
        title={t("Ta'lim")}
        className={cn(Sahna && SAHNA_PARDASI)}
      />

      {/*
        Yo'l holatidan MUSTAQIL: `YolTepasi` o'z so'rovini o'zi boshqaradi
        (skelet/yashirish), shuning uchun yo'l hali yuklanayotgan yoki xato
        bo'lganda ham tepada joyida turadi.
      */}
      <YolTepasi />

      {loadState(query) === "loading" ? (
        <LoadingCards count={3} />
      ) : !data ? (
        // Past "loading", no data means offline or failed — LoadFailed says
        // which; offline the request resumes by itself, so no button.
        <LoadFailed query={query} className={cn(Sahna && SAHNA_KARTASI)} />
      ) : yolBosh ? (
        <EmptyState
          className={cn(Sahna && SAHNA_KARTASI)}
          icon={<BookOpen size={28} weight="bold" />}
          title={t("O'quv yo'li hali tayyor emas")}
          description={t("Material tez orada qo'shiladi.")}
        />
      ) : (
        <FadeIn className="space-y-4">
          <LernenYol levels={data} onUnitKorindi={setKorinayotganUnitId} />

          <section className="space-y-3">
            <h2
              className={cn(
                "font-display text-sm font-bold uppercase tracking-wide text-ink-500",
                Sahna && SAHNA_PARDASI_KICHIK,
              )}
            >
              {t("Imtihon yo'nalishlari")}
            </h2>
            <div className="lumio-stagger grid grid-cols-2 gap-3">
              {SKILLS.map((s, i) => (
                <Card
                  key={s.key}
                  className="space-y-2 opacity-70"
                  style={{ ["--i" as string]: i } as React.CSSProperties}
                >
                  <IconTile
                    tone={s.tone}
                    size="sm"
                    icon={<s.icon size={18} weight="bold" />}
                  />
                  <div>
                    <p className="font-display font-bold text-ink-900">
                      {s.label}
                    </p>
                    {/* In German the subtitle is the label itself («Hören»). */}
                    {t(s.sub) !== s.label && (
                      <p className="text-xs font-semibold text-ink-500">
                        {t(s.sub)}
                      </p>
                    )}
                  </div>
                  <Badge tone="neutral" size="sm">
                    {t("Tez orada")}
                  </Badge>
                </Card>
              ))}
            </div>
          </section>
        </FadeIn>
      )}
    </Screen>
  );
}
