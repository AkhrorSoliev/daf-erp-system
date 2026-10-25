"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowsClockwise, CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import type { LessonNodeTone } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { Dafi } from "../dafi/dafi";
import { ovozChal, ovozniUygot } from "../ovoz/ovoz";
import { useFortschritt } from "../queries";
import { useLernenTema } from "../tema/use-lernen-tema";
import type { LernenLevel } from "../types";
import { useJoriyUnit } from "./joriy-unit";
import { SeansVaraq } from "./seans-varaq";
import { useYolSkroll } from "./yol-skroll";
import {
  yolMoljali,
  yolQatorMetasi,
  yolTugunlari,
  type YolTugun,
} from "./yol-tuzilishi";
import { YopishqoqUnitLavha } from "./yopishqoq-unit-lavha";

/** Daraja rangi — CEO tasdiqlagan uchlik: A1 koral, A2 teal, B1 uzum. */
const DARAJA_TONE: Record<string, LessonNodeTone> = {
  A1: "coral",
  A2: "teal",
  B1: "grape",
};

/** Unit qatorining foni/matni — `LessonNode`dagi tuslar bilan bir xil juftlik. */
const UNIT_QATOR_TONE: Record<string, string> = {
  A1: "bg-coral-100 text-coral-700",
  A2: "bg-teal-50 text-teal-700",
  B1: "bg-grape-100 text-grape-600",
};

/**
 * Qatorning tekislanishi — markaz → o'ng → markaz → chap, to'rt bosqichda
 * takrorlanadi. Faqat `LessonNode` tugunlariga (`seans`/`tez-orada`)
 * tegishli: unit qatori va daraja yorlig'i har doim to'liq kenglikda, ular
 * zigzagning qismi emas — shuning uchun sanoq ular ustidan "sakrab" o'tadi,
 * to'xtamaydi.
 */
const TEKISLASH = [
  "justify-center",
  "justify-end",
  "justify-center",
  "justify-start",
] as const;

export interface LernenYolProps {
  levels: LernenLevel[];
}

/** Daraja o'zgargan joydagi ajratuvchi yorliq — masalan "A1". */
function DarajaYorligi({ matn }: { matn: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span aria-hidden className="h-px flex-1 bg-line" />
      <span className="font-display text-sm font-extrabold uppercase tracking-wide text-ink-500">
        {matn}
      </span>
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}

/**
 * Unit sarlavhasi — rangli qator, bosilganda unit sahifasi ochiladi.
 *
 * Har doim bosiladi: bu yerdagi `holat` (`yolTugunlari` uni doim "done"
 * qiladi) o'z seanslarining qulf holatiga bog'liq emas — unit sahifasi
 * shunchaki "bu unitda nima bor" degan xulosa, o'quvchi uni istalgan
 * vaqt ko'ra oladi.
 */
function UnitQatori({
  tugun,
  onClick,
  ref,
}: {
  tugun: YolTugun;
  onClick: () => void;
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const tone = UNIT_QATOR_TONE[tugun.daraja] ?? UNIT_QATOR_TONE.A1;
  return (
    <button
      ref={ref}
      type="button"
      data-yol-unit=""
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left shadow-lumio-sm transition-transform active:translate-y-[2px] hover:-translate-y-0.5",
        tone,
      )}
    >
      <span className="min-w-0 flex-1 truncate font-display text-base font-extrabold">
        {tugun.matn}
      </span>
      <CaretRight size={18} weight="bold" className="shrink-0" />
    </button>
  );
}

/**
 * `seans` va `tez-orada` — ikkalasi ham tema tugun belgisi bilan chiziladi.
 *
 * `tez-orada` uchun `id` yo'q (`yolTugunlari` uni har doim `null` qiladi) va
 * `holat` har doim `"locked"`. Joriy tugun yonida Dafi turadi: u zigzagning
 * bo'sh tomonida (chap tekislashda o'ng tomonda) chiziladi.
 */
function SeansTuguni({
  tugun,
  align,
  ostyozuvKorinsinmi,
  onClick,
  onQulf,
  ref,
}: {
  tugun: YolTugun;
  align: (typeof TEKISLASH)[number];
  ostyozuvKorinsinmi: boolean;
  onClick?: () => void;
  onQulf?: () => void;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const { tema } = useLernenTema();
  const Belgi = tema.TugunBelgisi;
  const dafiOngda = align === "justify-start";
  return (
    <div ref={ref} className={cn("flex", align)}>
      <div className="relative flex flex-col items-center gap-1.5">
        {ostyozuvKorinsinmi && tugun.ostyozuv ? (
          <p className="max-w-[132px] truncate text-center text-[11px] font-bold uppercase tracking-wide text-ink-400">
            {tugun.ostyozuv}
          </p>
        ) : null}
        {tugun.holat === "active" ? (
          <div className={cn("absolute top-3", dafiOngda ? "-right-[84px]" : "-left-[84px]")}>
            <Dafi holat="tinch" olcham="sm" />
          </div>
        ) : null}
        <Belgi
          label={tugun.matn}
          holat={tugun.holat}
          tone={DARAJA_TONE[tugun.daraja] ?? "coral"}
          onClick={onClick}
          onBosilmagan={onQulf}
        />
      </div>
    </div>
  );
}

/**
 * O'quv yo'lining o'zi — Duolingo uslubidagi zigzag, tepa qismisiz
 * (sarlavha, holat va "Ta'lim" nomi chaqiruvchi sahifada).
 *
 * Holat qarorlarining HAMMASI `yolTugunlari`da — bu komponent faqat
 * o'sha yassi ro'yxatni o'qiydi va turi bo'yicha chizadi, qayta
 * hisoblamaydi.
 */
export function LernenYol({ levels }: LernenYolProps) {
  const router = useRouter();
  const t = useT();
  const tugunlar = React.useMemo(() => yolTugunlari(levels, t), [levels, t]);
  // Zigzag bosqichi va "bo'lim o'zgardimi" bayrog'i `yol-tuzilishi.ts`da
  // hisoblanadi va sinaladi (`yol-tuzilishi.test.ts`) — bu komponent faqat
  // bosqich raqamini Tailwind tekislanish sinfiga aylantiradi.
  const zigzag = React.useMemo(() => yolQatorMetasi(tugunlar), [tugunlar]);
  // O'quvchi yetgan unit va seans — sahifa ochilganda shu yerga silliq
  // olib boriladi (`useYolSkroll`). Kalit seans ID'si: u o'zgarmaguncha
  // qayta so'rovlar sahifani qimirlatmaydi.
  const moljal = React.useMemo(() => yolMoljali(tugunlar), [tugunlar]);
  const { unitRef, seansRef } = useYolSkroll(
    moljal ? tugunlar[moljal.seansIndex].id : null,
  );

  // The sound engine is a separate chunk. Preload it so it is already here when the
  // first tap arrives: on iOS/Telegram WebViews the audio unlock must run inside the tap.
  React.useEffect(() => {
    void import("../ovoz/ovoz-motor");
  }, []);

  const konteyner = React.useRef<HTMLDivElement>(null);
  const joriyUnit = useJoriyUnit(konteyner);
  const unitlar = React.useMemo(() => tugunlar.filter((x) => x.tur === "unit"), [tugunlar]);
  const [varaq, setVaraq] = React.useState<YolTugun | null>(null);

  const fortschritt = useFortschritt();
  // Dizayn §4: hech qanday so'z muddati kelmagan bo'lsa tugma XIRA va
  // bosilmaydi — bosilsa o'quvchi bo'sh ekranga tushardi (Fix 5).
  //
  // `fortschritt.isError` bo'lganda tugma FAOL qoladi, xira EMAS: ball
  // va bu son shunchaki bezak, muvaffaqiyatsiz yon so'rov ishlaydigan
  // funksiyani (Takrorlashning o'zini) o'quvchidan tortib olmasligi
  // kerak — xuddi `YolTepasi`dagi qoidaning aksi (u yiqilsa yashiradi,
  // bu yerda esa yiqilsa BAHONA bermay ishlashda davom etadi).
  const xiraTakrorlash =
    !fortschritt.isError &&
    fortschritt.data != null &&
    fortschritt.data.faelligeWoerter === 0;

  return (
    <div ref={konteyner} className="mx-auto flex w-full max-w-md flex-col gap-5">
      <button
        type="button"
        // `disabled` ATAYLAB QO'YILMAGAN: u tugmani tab tartibidan
        // chiqarib yuboradi, ya'ni "Bugun takrorlanadigan so'z yo'q"
        // degan yagona izoh klaviatura bilan yuradigan o'quvchiga
        // umuman yetmay qolardi. `aria-disabled` holatni e'lon qiladi,
        // bosishni esa `onClick`ning o'zi to'xtatadi.
        onClick={
          xiraTakrorlash
            ? undefined
            : () => router.push("/portal/lernen/wiederholung")
        }
        aria-disabled={xiraTakrorlash}
        className={cn(
          "flex items-center justify-center gap-2 rounded-full border border-line px-5 py-3 font-display text-sm font-extrabold shadow-lumio-sm transition-transform",
          xiraTakrorlash
            ? "cursor-not-allowed bg-tint text-ink-400"
            : "bg-surface text-ink-900 active:translate-y-[2px] hover:-translate-y-0.5",
        )}
      >
        <ArrowsClockwise
          size={18}
          weight="bold"
          className={xiraTakrorlash ? "text-ink-400" : "text-coral-500"}
        />
        {xiraTakrorlash ? t("Bugun takrorlanadigan so'z yo'q") : t("Takrorlash")}
      </button>

      {unitlar.length > 0 ? (
        <YopishqoqUnitLavha
          matn={unitlar[Math.min(joriyUnit, unitlar.length - 1)].matn}
          daraja={unitlar[Math.min(joriyUnit, unitlar.length - 1)].daraja}
        />
      ) : null}

      <div className="flex flex-col gap-5">
        {tugunlar.map((tugun, i) => {
          if (tugun.tur === "daraja") {
            return <DarajaYorligi key={`daraja-${i}-${tugun.daraja}`} matn={tugun.matn} />;
          }

          if (tugun.tur === "unit") {
            return (
              <UnitQatori
                key={`unit-${tugun.id}`}
                ref={i === moljal?.unitIndex ? unitRef : undefined}
                tugun={tugun}
                onClick={() => router.push(`/portal/lernen/units/${tugun.id}`)}
              />
            );
          }

          // `seans` va `tez-orada` — zigzagning bosqichi, oldindan
          // hisoblangan (`yolQatorMetasi`) meta bilan.
          const meta = zigzag[i];
          const align = TEKISLASH[meta.zigzagBosqichi % TEKISLASH.length];

          return (
            <SeansTuguni
              key={tugun.tur === "seans" ? `seans-${tugun.id}` : `tez-orada-${i}-${tugun.daraja}`}
              ref={i === moljal?.seansIndex ? seansRef : undefined}
              tugun={tugun}
              align={align}
              ostyozuvKorinsinmi={meta.ostyozuvKorinsinmi}
              onClick={
                tugun.tur === "seans" && tugun.holat !== "locked"
                  ? () => {
                      ovozniUygot();
                      ovozChal("bos");
                      setVaraq(tugun);
                    }
                  : undefined
              }
              onQulf={() => {
                ovozniUygot();
                ovozChal("qulf");
              }}
            />
          );
        })}
      </div>

      <SeansVaraq
        tugun={varaq}
        onYopish={() => setVaraq(null)}
        onBoshlash={() => {
          if (varaq?.id != null) {
            ovozChal("unitOchildi");
            router.push(`/portal/lernen/lessons/${varaq.id}`);
          }
          setVaraq(null);
        }}
      />
    </div>
  );
}
