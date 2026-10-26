"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Screen,
  StackHeader,
  Stagger,
  Button,
  EmptyState,
  LoadingCards,
  ProgressBar,
} from "../lumio";
import { useT } from "@/i18n/use-t";
import { useLernenUnit } from "./queries";
import { loadState } from "../lib/load-state";
import { useSidebar } from "../lib/sidebar-store";
import { LoadFailed } from "../load-failed";
import { seansHolatlari, type SeansHolatBelgisi } from "./fortschritt";
import { useKamHarakat } from "./harakat/use-kam-harakat";
import { ovozChal, ovozniUygot } from "./ovoz/ovoz";
import { sozHisoblagichi, type SozHisoblagichi } from "./soz-hisoblagichi";
import { SAHNA_KARTASI, SAHNA_PARDASI, SAHNA_PARDASI_KICHIK, SahnaRamka } from "./tema/sahna-ramka";
import { useLernenTema } from "./tema/use-lernen-tema";
import type { TugunHolat, TugunTone } from "./tema/tema-turlari";
import { DARAJA_TONI } from "./tema/toza/toza-tugun-model";
import type { LernenSeans } from "./types";
import type { Translate } from "./liga";

/**
 * Seans nomi `kind`dan kelib chiqadi — MAVZU emas, A1 xaritasidagi
 * BOSQICH. `null` — eski DiB darsi, uning o'z nomi bor.
 */
function seansNomi(seans: LernenSeans, t: Translate): string {
  switch (seans.kind) {
    case "SECTION_A":
      return t("Tanishuv");
    case "SECTION_B":
      return t("Ishlatish");
    case "BRIDGE":
      return t("O'tish sinovi");
    case "UNIT_TEST":
      return t("Yakuniy sinov");
    default:
      return seans.titleUz ?? seans.titleDe;
  }
}

/** The lock chain's answer in the path's words. */
const TUGUN_HOLATI: Record<SeansHolatBelgisi, TugunHolat> = {
  BAJARILGAN: "done",
  NAVBATDAGI: "active",
  QULF: "locked",
};

/** The section's word counter: «So'zlar: 14 / 28» and a thin bar (ADR-0071). */
function SozlarQatori({ hisob, className }: { hisob: SozHisoblagichi; className?: string }) {
  return (
    <div className={cn("space-y-1 px-1", className)}>
      <p
        className={cn(
          "flex items-center gap-1 text-xs font-bold tabular-nums",
          hisob.tugadi ? "text-artikel-das" : "text-ink-600",
        )}
      >
        {hisob.tugadi ? <CheckCircle size={14} weight="fill" aria-hidden /> : null}
        {hisob.matn}
      </p>
      <ProgressBar
        value={hisob.foiz}
        height={6}
        color={hisob.tugadi ? "var(--success)" : "var(--coral-500)"}
      />
    </div>
  );
}

/**
 * Unit — bo'limlar ostida guruhlangan seanslar.
 *
 * Qulf butun UNIT bo'yicha hisoblanadi, bo'lim ichida emas: agar har
 * bo'lim o'z navbatini alohida hisoblasa, bir vaqtning o'zida uchta
 * seans «navbatdagi» bo'lib ko'rinardi (har bo'limda bittadan).
 *
 * The header and the places are the theme's (`LernenTema.UnitLavha`,
 * `LernenTema.UnitJoyi`; ADR-0128, ADR-0131): the page decides, the theme draws.
 */
export function LernenUnitPage({ unitId }: { unitId: number }) {
  const t = useT();
  const router = useRouter();
  const { tema } = useLernenTema();
  const Sahna = tema.Sahna;
  const sidebarMode = useSidebar((s) => s.mode);
  // Marks the less-motion state for CSS: the entrance stagger resolves at once (globals.css).
  const kam = useKamHarakat();
  const query = useLernenUnit(unitId);
  const { data } = query;

  // The sound engine is its own chunk and this page opens by URL too: load it
  // now, so on iOS/Telegram the unlock finds it ready inside the first tap.
  React.useEffect(() => {
    void import("./ovoz/ovoz-motor").catch(() => {});
  }, []);

  const holatMap = React.useMemo(() => {
    if (!data) return new Map<number, SeansHolatBelgisi>();
    const hammasi = [
      ...data.sections.flatMap((s) => s.lessons),
      ...(data.finalTest ? [data.finalTest] : []),
    ];
    const holatlar = seansHolatlari(hammasi);
    return new Map(hammasi.map((l, i) => [l.id, holatlar[i]]));
  }, [data]);

  // Eski DiB uniti: bo'lim tushunchasi umuman yo'q, shuning uchun yassi
  // ro'yxat o'z navbatini alohida hisoblaydi (butun unit emas).
  const yassiHolatMap = React.useMemo(() => {
    if (!data || data.sections.length > 0) {
      return new Map<number, SeansHolatBelgisi>();
    }
    const holatlar = seansHolatlari(data.lessons);
    return new Map(data.lessons.map((l, i) => [l.id, holatlar[i]]));
  }, [data]);

  // Each place's position on the page (the sections' lessons in order, then the
  // final test): a theme with a scene alternates the places' sides by it.
  const tartibMap = React.useMemo(() => {
    if (!data) return new Map<number, number>();
    const hammasi =
      data.sections.length > 0
        ? [...data.sections.flatMap((s) => s.lessons), ...(data.finalTest ? [data.finalTest] : [])]
        : data.lessons;
    return new Map(hammasi.map((l, i) => [l.id, i]));
  }, [data]);

  // Unlock first, inside the tap, then play: the audio context starts only in a gesture.
  const openLesson = (id: number) => {
    ovozniUygot();
    ovozChal("bos");
    router.push(`/portal/lernen/lessons/${id}`);
  };
  // A locked place answers with the short "locked" sound and opens nothing.
  const qulfBosildi = () => {
    ovozniUygot();
    ovozChal("qulf");
  };
  const tone: TugunTone = (data && DARAJA_TONI[data.level]) || "coral";

  // One lesson as the theme's place: the lock chain's answer and the
  // words-left caption (only under a finished section lesson), in the path's words.
  const joy = (seans: LernenSeans, belgi: SeansHolatBelgisi, yanaMashq?: string | null) => {
    const holat = TUGUN_HOLATI[belgi];
    const bolimDarsi = seans.kind === "SECTION_A" || seans.kind === "SECTION_B";
    return (
      <tema.UnitJoyi
        key={seans.id}
        label={seansNomi(seans, t)}
        kind={seans.kind}
        holat={holat}
        tone={tone}
        izoh={holat === "done" && bolimDarsi ? (yanaMashq ?? null) : null}
        tartib={tartibMap.get(seans.id) ?? 0}
        onClick={() => openLesson(seans.id)}
        onBosilmagan={qulfBosildi}
      />
    );
  };

  // A unit whose content is not written yet still has its seeded lessons;
  // the server says so with `bereit: false` (absent from an older server).
  const boshMi =
    data &&
    (data.bereit === false ||
      (data.sections.length === 0 && data.lessons.length === 0));

  return (
    // The marker sits on this outer root; the stagger below is strictly inside it (descendant selector).
    // `isolate` (only with a scene): the frame (-z-10) stays behind the page and above the shell's background.
    <Screen narrow data-kam-harakat={kam ? "" : undefined} className={cn(Sahna && "isolate")}>
      {/* Independent of the unit's request (spec §10): the scene stands while it loads or fails too. */}
      {Sahna ? (
        <SahnaRamka sidebarMode={sidebarMode}>
          <Sahna unitTartibi={data?.order ?? 1} />
        </SahnaRamka>
      ) : null}
      <StackHeader
        title={data?.titleUz ?? t("Bo'lim")}
        backHref="/portal/lernen"
        className={cn(Sahna && SAHNA_PARDASI)}
      />

      {loadState(query) === "loading" ? (
        <LoadingCards count={3} />
      ) : !data ? (
        <LoadFailed query={query} className={cn(Sahna && SAHNA_KARTASI)} />
      ) : boshMi ? (
        <EmptyState
          className={cn(Sahna && SAHNA_KARTASI)}
          icon={<BookOpen size={28} weight="bold" />}
          title={t("Bu unitning mashqlari hali tayyor emas")}
          description={t("Material tez orada qo'shiladi.")}
          action={
            <Button
              variant="secondary"
              onClick={() => router.push("/portal/lernen")}
            >
              {t("Orqaga")}
            </Button>
          }
        />
      ) : data.sections.length > 0 ? (
        <Stagger className="space-y-5">
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} unitTartibi={data.order} />

          {data.sections.map((section) => {
            const hisob = sozHisoblagichi(section.woerter, t);
            return (
              <section key={section.id} className="space-y-2">
                <div className={cn("px-1", Sahna && SAHNA_PARDASI)}>
                  <h2 className="font-display text-base font-extrabold text-ink-900">
                    {section.order}. {section.titleUz}
                  </h2>
                  <p className="text-xs font-semibold text-ink-600">
                    {section.titleDe}
                  </p>
                </div>
                {hisob ? <SozlarQatori hisob={hisob} className={cn(Sahna && SAHNA_PARDASI)} /> : null}
                <div className="space-y-2">
                  {section.lessons.map((l) => joy(l, holatMap.get(l.id) ?? "QULF", hisob?.yanaMashq))}
                </div>
              </section>
            );
          })}

          {data.finalTest ? (
            <section className="space-y-2 border-t border-line pt-4">
              <h2
                className={cn(
                  "px-1 font-display text-base font-extrabold text-ink-900",
                  Sahna && SAHNA_PARDASI_KICHIK,
                )}
              >
                {t("Yakuniy sinov")}
              </h2>
              {joy(data.finalTest, holatMap.get(data.finalTest.id) ?? "QULF")}
            </section>
          ) : null}
        </Stagger>
      ) : (
        // Eski DiB uniti: bo'lim yo'q, darslar guruhsiz ro'yxat.
        <Stagger className="space-y-2">
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} unitTartibi={data.order} />
          {data.lessons.map((l) => joy(l, yassiHolatMap.get(l.id) ?? "QULF"))}
        </Stagger>
      )}
    </Screen>
  );
}
