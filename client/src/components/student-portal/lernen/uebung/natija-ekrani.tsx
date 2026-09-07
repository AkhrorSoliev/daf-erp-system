"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Clock, Fire, Star, Trophy } from "@phosphor-icons/react";
import { Button, Card, FadeIn, StatChip } from "../../lumio";
import type { SeansXato } from "../seans-navbat";
import { useFortschritt } from "../queries";
import { orinXabari } from "./natija-xabari";

export interface NatijaEkraniProps {
  togri: number;
  jami: number;
  durationMs: number;
  xatolar: SeansXato[];
  unitId: number | null;
  onQayta: () => void;
  /**
   * Seans BOSHLANGANDAGI `Fortschritt` — bittasi ham serverdan qayta
   * hisoblanmaydi, faqat seans oxiridagi (`useFortschritt` ning joriy
   * javobi) qiymat bilan solishtiriladi. Barchasi `null` bo'lishi mumkin:
   * seans boshlanganda `useFortschritt` hali yuklanmagan bo'lsa.
   */
  gesamtBoshida: number | null;
  serieBoshida: number | null;
  orinBoshida: number | null;
}

/** `durationMs` ni `daqiqa:soniya` ko'rinishiga o'tkazadi — masalan 65_000 → "1:05". */
function vaqtBelgisi(durationMs: number): string {
  const jamiSoniya = Math.round(durationMs / 1000);
  const daqiqa = Math.floor(jamiSoniya / 60);
  const soniya = jamiSoniya % 60;
  return `${daqiqa}:${String(soniya).padStart(2, "0")}`;
}

const SANOQ_DAVOMIYLIGI = 600;

/**
 * `maqsad` gacha noldan sanab chiqadigan qiymat — `requestAnimationFrame`
 * bilan, ~600ms. `prefers-reduced-motion` yoqilgan bo'lsa animatsiya
 * UMUMAN ishlamaydi, oxirgi qiymat darrov ko'rsatiladi: harakatni
 * kamaytirishni so'ragan o'quvchi uchun raqamning o'zi muhim, uning
 * sakrab o'sishi emas.
 */
function useSanaladiganBall(maqsad: number | null): number | null {
  const [qiymat, setQiymat] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (maqsad == null) {
      setQiymat(null);
      return;
    }

    const kamHarakatSoraladi =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (kamHarakatSoraladi || maqsad === 0) {
      setQiymat(maqsad);
      return;
    }

    const boshi = performance.now();
    let frameId: number;

    const kadr = (hozir: number) => {
      const foiz = Math.min(1, (hozir - boshi) / SANOQ_DAVOMIYLIGI);
      setQiymat(Math.round(foiz * maqsad));
      if (foiz < 1) {
        frameId = requestAnimationFrame(kadr);
      }
    };
    frameId = requestAnimationFrame(kadr);
    return () => cancelAnimationFrame(frameId);
  }, [maqsad]);

  return qiymat;
}

/**
 * Bitta xato satrini o'qish mumkin bo'lgan ko'rinishda chizadi.
 *
 * Ko'rik topilmasi (IMPORTANT): eski ko'rinish `prompt` va `richtig`ni
 * ikkita `span`ga solib, bitta `justify-between` qatorga joylardi.
 * `DIALOG_LUECKE`da `prompt` BUTUN suhbat (bir necha qator matn),
 * `ZUORDNEN`da `richtig` esa olti juftlikni pipe bilan ulagan ~300
 * belgili qator — ikkalasi ham bitta bo'yalgan qatorga sig'maydi.
 * Bu yerda FORMATga qarab uchta ko'rinish tanlanadi:
 *  - `DIALOG_LUECKE` — suhbat o'rniga qisqa `titel` (dialog nomi),
 *    javob (bitta yo'q bo'lgan qator) o'zgarishsiz qoladi.
 *  - `ZUORDNEN` — `richtig`ni "vaziyat=ibora" juftlariga bo'lib,
 *    RO'YXAT sifatida chizadi (bitta uzun qalin qator emas).
 *  - qolgan formatlar — eski ikkita `span`li ko'rinish.
 */
function XatoQatori({ xato }: { xato: SeansXato }) {
  if (xato.format === "ZUORDNEN") {
    const juftlar = xato.richtig.split("|").map((juft) => {
      const [vaziyat, ibora] = juft.split("=");
      return { vaziyat: vaziyat ?? "", ibora: ibora ?? "" };
    });
    return (
      <ul className="space-y-1">
        {juftlar.map((j, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-600">{j.vaziyat}</span>
            <span className="font-bold text-danger">{j.ibora}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (xato.format === "DIALOG_LUECKE") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink-800">{xato.titel ?? "Dialog"}</span>
        <span className="text-sm font-bold text-danger">{xato.richtig}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-ink-800">{xato.prompt}</span>
      <span className="text-sm font-bold text-danger">{xato.richtig}</span>
    </div>
  );
}

/**
 * Seans tugagandan keyingi natija ekrani: ball, sarflangan vaqt va
 * xato qilingan so'zlar. To'g'ri javob har bir xato uchun `xatolar`
 * ichida allaqachon bor — bu ekran hech narsani qayta hisoblamaydi,
 * faqat `seans-navbat.ts` yig'gan holatni ko'rsatadi.
 *
 * Ball, seriya va o'rin ham xuddi shunday — MIJOZ ULARNI HISOBLAMAYDI.
 * `useFortschritt` seans boshida bir marta o'qilib (`gesamtBoshida` va
 * hokazo — chaqiruvchi eslab qoladi), shu yerda ESA joriy (seansdan
 * keyingi, `useAbschluss`/`SeansEkrani` allaqachon yangilagan) qiymat
 * bilan solishtiriladi. Ekranda ko'rinadigan raqam shu ikkisining farqi
 * — ya'ni serverning o'zi bergan raqam, mijoz hisob-kitobi emas.
 */
export function NatijaEkrani({
  togri,
  jami,
  durationMs,
  xatolar,
  unitId,
  onQayta,
  gesamtBoshida,
  serieBoshida,
  orinBoshida,
}: NatijaEkraniProps) {
  const router = useRouter();
  const fortschritt = useFortschritt();
  const davomHref = unitId ? `/portal/lernen/units/${unitId}` : "/portal/lernen";

  // Farq faqat IKKALA uchi ham ma'lum bo'lganda hisoblanadi — aks holda
  // "0 ball topdingiz" kabi noto'g'ri xabar chiqib ketardi, holbuki
  // haqiqatda serverdan javob hali kelmagan, xolos.
  const topilganBall =
    gesamtBoshida != null && fortschritt.data
      ? Math.max(0, fortschritt.data.gesamt - gesamtBoshida)
      : null;
  const sanaladiganBall = useSanaladiganBall(topilganBall);
  // Nol — qonuniy natija (masalan takrorlashda hech narsa muddati
  // kelmagan bo'lishi mumkin), lekin "+0 ball" chipi buzilishdek
  // o'qiladi. Shuning uchun BALL FAQAT musbat bo'lganda ko'rsatiladi —
  // seriya va o'rin qatorlari esa nol ball bilan ham o'z holicha turaveradi.
  const ballKorsatilsinmi = topilganBall != null && topilganBall > 0;

  // Seriya faqat OSHGANDA ko'rsatiladi (bugungi birinchi seans) — buni
  // aytadigan server, mijoz emas: `serieBoshida` seansdan oldingi qiymat,
  // `fortschritt.data.serie` esa hozirgisi.
  const serieOshdimi =
    serieBoshida != null &&
    fortschritt.data != null &&
    fortschritt.data.serie > serieBoshida;

  const orinXabariMatni = orinXabari(
    orinBoshida,
    fortschritt.data?.wochePlatzGruppe ?? null,
  );

  const yutuqlarBormi = ballKorsatilsinmi || serieOshdimi || orinXabariMatni != null;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-4 px-4 py-8">
      <FadeIn className="space-y-4">
        <Card className="space-y-3 text-center">
          <Trophy size={48} weight="fill" className="mx-auto text-amber-500" />
          <div>
            <p className="font-display text-4xl font-bold text-ink-900">
              {togri} / {jami}
            </p>
            <p className="mt-1 flex items-center justify-center gap-1.5 font-semibold text-ink-500">
              <Clock size={16} weight="bold" />
              {vaqtBelgisi(durationMs)}
            </p>
          </div>
        </Card>

        {yutuqlarBormi ? (
          <Card className="flex flex-wrap items-center justify-center gap-2 text-center">
            {ballKorsatilsinmi && sanaladiganBall != null ? (
              <StatChip
                icon={<Star weight="fill" className="text-amber-500" />}
                value={`+${sanaladiganBall} ball`}
              />
            ) : null}
            {serieOshdimi ? (
              <StatChip
                icon={<Fire weight="fill" className="text-coral-500" />}
                value={`${fortschritt.data?.serie} kun`}
                label="seriya"
              />
            ) : null}
            {orinXabariMatni ? (
              <p className="w-full text-sm font-semibold text-ink-700">{orinXabariMatni}</p>
            ) : null}
          </Card>
        ) : null}

        <Card className="space-y-3">
          {xatolar.length === 0 ? (
            <p className="text-center font-semibold text-ink-700">
              Hammasi to&apos;g&apos;ri — ajoyib natija!
            </p>
          ) : (
            <>
              <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                Qaytarib ko&apos;ring · {xatolar.length}
              </p>
              <ul className="space-y-2">
                {xatolar.map((x, i) => (
                  <li
                    key={`${x.itemType}:${x.itemId}:${i}`}
                    className="rounded-xl bg-tint px-3.5 py-2.5"
                  >
                    <XatoQatori xato={x} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onQayta}>
            Qayta o&apos;tish
          </Button>
          <Button className="flex-1" onClick={() => router.push(davomHref)}>
            Davom etish
          </Button>
        </div>
      </FadeIn>
    </div>
  );
}
