"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, CheckCircle, LockSimple, Star } from "@phosphor-icons/react";
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
import { LoadFailed } from "../load-failed";
import { seansHolatlari, type SeansHolatBelgisi } from "./fortschritt";
import { useKamHarakat } from "./harakat/use-kam-harakat";
import { ovozChal, ovozniUygot } from "./ovoz/ovoz";
import { sozHisoblagichi, type SozHisoblagichi } from "./soz-hisoblagichi";
import { useLernenTema } from "./tema/use-lernen-tema";
import type { TugunHolat, TugunTone } from "./tema/tema-turlari";
import { DARAJA_TONI, belgiTuri, tugunRangi } from "./tema/toza/toza-tugun-model";
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

/**
 * One lesson as a «place» of the unit (spec §8): the path's own node badge
 * (check, star, lock), the name, and «Boshlash» on the current one. A locked
 * place stays a button — it answers with the short "locked" sound — but tells
 * screen readers it is closed, as the path node does.
 */
function SeansJoyi({
  seans,
  holat,
  tone,
  onOpen,
  onQulf,
  yanaMashq,
}: {
  seans: LernenSeans;
  holat: SeansHolatBelgisi;
  tone: TugunTone;
  onOpen: (id: number) => void;
  onQulf: () => void;
  /** Under a finished section lesson while the section has unmet words. */
  yanaMashq?: string | null;
}) {
  const t = useT();
  const tugun = TUGUN_HOLATI[holat];
  const qulf = tugun === "locked";
  const joriy = tugun === "active";
  const { yuz, lab } = tugunRangi(tugun, tone);
  const belgi = belgiTuri(tugun);
  const Icon = belgi === "tekshirildi" ? Check : belgi === "yulduz" ? Star : LockSimple;
  const nom = seansNomi(seans, t);
  const izoh =
    tugun === "done" && (seans.kind === "SECTION_A" || seans.kind === "SECTION_B")
      ? yanaMashq
      : null;
  return (
    <button
      type="button"
      onClick={qulf ? onQulf : () => onOpen(seans.id)}
      aria-disabled={qulf || undefined}
      aria-label={qulf ? t("{label} — hali ochilmagan", { label: nom }) : undefined}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-card border-2 border-b-[5px] border-line bg-surface px-4 py-3 text-left transition-transform",
        qulf ? "cursor-default" : "active:translate-y-[3px] hover:-translate-y-0.5",
      )}
      style={joriy ? { borderColor: yuz } : undefined}
    >
      <span
        aria-hidden
        className="grid size-11 shrink-0 place-items-center rounded-full"
        style={{
          background: yuz,
          color: qulf ? "var(--ink-400)" : "#fff",
          boxShadow: `0 4px 0 ${lab}`,
        }}
      >
        <Icon size={22} weight="fill" />
      </span>
      <span className="min-w-0 flex-1">
        {/* Text on white: ink-600 (6.58:1) for a closed lesson — a pale ink-400 (2.52:1) is unreadable, the lock badge already says "closed". */}
        <span
          className={cn(
            "block truncate font-semibold",
            qulf ? "text-ink-600" : "text-ink-900",
          )}
        >
          {nom}
        </span>
        {izoh ? (
          <span className="block truncate text-xs font-semibold text-[var(--amber-ink)]">
            {izoh}
          </span>
        ) : null}
      </span>
      {joriy ? (
        // White text needs 4.5:1: the level colour itself is 2.48-4.23:1, its darker lip 4.56-7.10:1.
        <span
          className="shrink-0 rounded-full px-3 py-1 font-display text-xs font-extrabold uppercase tracking-wide text-white"
          style={{ background: lab }}
        >
          {t("Boshlash")}
        </span>
      ) : null}
    </button>
  );
}

/** The section's word counter: «So'zlar: 14 / 28» and a thin bar (ADR-0071). */
function SozlarQatori({ hisob }: { hisob: SozHisoblagichi }) {
  return (
    <div className="space-y-1 px-1">
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
 * The header is the theme's (`LernenTema.UnitLavha`); the places reuse the
 * «Toza» node model (ADR-0128).
 */
export function LernenUnitPage({ unitId }: { unitId: number }) {
  const t = useT();
  const router = useRouter();
  const { tema } = useLernenTema();
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

  // A unit whose content is not written yet still has its seeded lessons;
  // the server says so with `bereit: false` (absent from an older server).
  const boshMi =
    data &&
    (data.bereit === false ||
      (data.sections.length === 0 && data.lessons.length === 0));

  return (
    // The marker sits on this outer root; the stagger below is strictly inside it (descendant selector).
    <Screen narrow data-kam-harakat={kam ? "" : undefined}>
      <StackHeader title={data?.titleUz ?? t("Bo'lim")} backHref="/portal/lernen" />

      {loadState(query) === "loading" ? (
        <LoadingCards count={3} />
      ) : !data ? (
        <LoadFailed query={query} />
      ) : boshMi ? (
        <EmptyState
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
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} />

          {data.sections.map((section) => {
            const hisob = sozHisoblagichi(section.woerter, t);
            return (
              <section key={section.id} className="space-y-2">
                <div className="px-1">
                  <h2 className="font-display text-base font-extrabold text-ink-900">
                    {section.order}. {section.titleUz}
                  </h2>
                  <p className="text-xs font-semibold text-ink-600">
                    {section.titleDe}
                  </p>
                </div>
                {hisob ? <SozlarQatori hisob={hisob} /> : null}
                <div className="space-y-2">
                  {section.lessons.map((l) => (
                    <SeansJoyi
                      key={l.id}
                      seans={l}
                      holat={holatMap.get(l.id) ?? "QULF"}
                      tone={tone}
                      onOpen={openLesson}
                      onQulf={qulfBosildi}
                      yanaMashq={hisob?.yanaMashq}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {data.finalTest ? (
            <section className="space-y-2 border-t border-line pt-4">
              <h2 className="px-1 font-display text-base font-extrabold text-ink-900">
                {t("Yakuniy sinov")}
              </h2>
              <SeansJoyi
                seans={data.finalTest}
                holat={holatMap.get(data.finalTest.id) ?? "QULF"}
                tone={tone}
                onOpen={openLesson}
                onQulf={qulfBosildi}
              />
            </section>
          ) : null}
        </Stagger>
      ) : (
        // Eski DiB uniti: bo'lim yo'q, darslar guruhsiz ro'yxat.
        <Stagger className="space-y-2">
          <tema.UnitLavha daraja={data.level} matn={`${data.label} · ${data.titleDe}`} />
          {data.lessons.map((l) => (
            <SeansJoyi
              key={l.id}
              seans={l}
              holat={yassiHolatMap.get(l.id) ?? "QULF"}
              tone={tone}
              onOpen={openLesson}
              onQulf={qulfBosildi}
            />
          ))}
        </Stagger>
      )}
    </Screen>
  );
}
