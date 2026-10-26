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

/** How long (ms) the visible unit must stay the same before the scene's biome follows it. */
const BIOME_SETTLE_MS = 250;

export function LernenLevelsPage() {
  const t = useT();
  const query = useLernenLevels();
  const { data } = query;
  const yolBosh = data != null && data.length === 0;
  const { tema } = useLernenTema();
  const Sahna = tema.Sahna;
  const sidebarMode = useSidebar((s) => s.mode);
  // The unit the student is scrolling through, told by the path.
  const [korinayotganUnitId, setKorinayotganUnitId] = React.useState<number | null>(null);
  // The unit the scene shows: the visible one once it has stayed the visible one for
  // BIOME_SETTLE_MS. Opening the page scrolls smoothly past every earlier unit, and each
  // one reports itself; a scene that followed every report would cross-fade through the
  // biomes one after another for a second on every open. Without a scene nothing is timed.
  const sahnali = Sahna != null;
  const [sahnadagiUnitId, setSahnadagiUnitId] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!sahnali) return;
    const taymer = setTimeout(() => setSahnadagiUnitId(korinayotganUnitId), BIOME_SETTLE_MS);
    return () => clearTimeout(taymer);
  }, [sahnali, korinayotganUnitId]);

  return (
    // `isolate` (only with a scene): the frame (-z-10) stays behind the page and above the shell's background.
    <Screen className={cn(Sahna && "isolate")}>
      {/* Independent of the path's request (spec §10): the scene stands while it loads or fails too. */}
      {Sahna ? (
        <SahnaRamka sidebarMode={sidebarMode}>
          <Sahna unitTartibi={joriyUnitTartibi(data, sahnadagiUnitId)} />
        </SahnaRamka>
      ) : null}

      {/* Sarlavha tab nomi bilan bir xil. «Darslar» Asosiy sahifada markazdagi
          guruh darslarini anglatadi — bu yerda ishlatilsa, ikki joy bitta nom
          bilan chalkashadi. */}
      <ScreenHeader
        // The shared header paints its subtitle ink-500 (3.97:1 on a plate): on a scene the text carries ink-600 itself.
        subtitle={Sahna ? <span className="text-ink-600">{t("Nemis tili")}</span> : t("Nemis tili")}
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
          {/* Only a scene follows the visible unit: without one the page must not re-render on every unit change. */}
          <LernenYol levels={data} onUnitKorindi={Sahna ? setKorinayotganUnitId : undefined} />

          <section className="space-y-3">
            <h2
              className={cn(
                "font-display text-sm font-bold uppercase tracking-wide",
                // On a scene the heading sits on a plate, in the ink that reads there (ADR-0132).
                Sahna ? ["text-ink-600", SAHNA_PARDASI_KICHIK] : "text-ink-500",
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
