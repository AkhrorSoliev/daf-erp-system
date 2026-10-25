"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { Clock, Fire, Star, Trophy } from "@phosphor-icons/react";
import { Button, Card, FadeIn, StatChip } from "../../lumio";
import { kamHarakatHozir } from "../harakat/kam-harakat";
import type { SeansXato } from "../seans-navbat";
import type { SeansNatijasi } from "../types";
import { natijaQatorlari, xatoYorligi } from "./natija-xabari";
import { DeWort } from "./de-wort";
import { sinovKorinishi, type SinovHolati } from "./sinov-natijasi";

export interface NatijaEkraniProps {
  togri: number;
  jami: number;
  durationMs: number;
  xatolar: SeansXato[];
  unitId: number | null;
  onQayta: () => void;
  /** Server javobidagi seans natijasi; yo'q bo'lsa yutuqlar kartasi chizilmaydi. */
  natija: SeansNatijasi | null;
  /** Yakuniy sinov darsida — server qarori holati; oddiy darsda yo'q. */
  sinov?: SinovHolati | null;
  /** `sinov.tur === "xato"` bo'lganda natijani qayta yuborish. */
  onNatijaQaytaYubor?: () => void;
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
 * bilan, ~600ms. Harakat kamaytirilgan bo'lsa (tizim yoki qurilma kaliti) animatsiya
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

    if (kamHarakatHozir() || maqsad === 0) {
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
 * `ZUORDNEN`/`PAAR`da `richtig` esa bir necha juftlikni pipe bilan
 * ulagan uzun qator — ikkalasi ham bitta bo'yalgan qatorga sig'maydi.
 * Bu yerda FORMATga qarab uchta ko'rinish tanlanadi:
 *  - `DIALOG_LUECKE` — suhbat o'rniga qisqa `titel` (dialog nomi),
 *    javob (bitta yo'q bo'lgan qator) o'zgarishsiz qoladi.
 *  - `ZUORDNEN`/`PAAR` (jonli juftlash, Task 3 ko'rik topilmasi:
 *    ikkalasi ham "chap=o'ng|…" shaklida BITTA mexanizm — `yigish.tsx`
 *    dagi izohga qarang) — `richtig`ni "chap=o'ng" juftlariga bo'lib,
 *    RO'YXAT sifatida chizadi (bitta uzun qalin qator emas).
 *  - qolgan formatlar — eski ikkita `span`li ko'rinish; chap ustun
 *    `xatoYorligi()` orqali tanlanadi (`AUDIO_WORT`/`WORT_TIPPEN`da
 *    `prompt` bo'sh bo'lgani uchun sobit "Eshitish savoli" yorlig'iga
 *    almashtiriladi — Task 4 ko'rik topilmasi, `natija-xabari.ts`ga
 *    qarang).
 */
function XatoQatori({ xato }: { xato: SeansXato }) {
  const t = useT();
  if (xato.format === "ZUORDNEN" || xato.format === "PAAR") {
    // Re-review topilmasi (Minor): `pruefeZuordnen`ning fail-closed yo'li
    // (`funktionUz` kolliziyasi) `richtig: ''` qaytarishi mumkin edi —
    // ZUORDNEN uchun kamdan-kam server-tomon kolliziya. `''.split("|")`
    // BO'SH MASSIV EMAS — `[""]` beradi, ya'ni tuzatilmasa shu yerda
    // bitta BO'SH qator (chapsiz, o'ngsiz) tint fon ichida chizilib
    // qolardi. Bunday holatda umuman ro'yxat chizmaymiz. Jonli
    // juftlashda (`seans-ekrani.tsx`, `juftlarniRichtigga`) `richtig`
    // amalda hech qachon bo'sh kelmaydi — savol faqat BARCHA juft
    // yashil bo'lgach tugaydi — lekin bu qo'riqchi shart bo'lmagan
    // taqdirda ham zararsiz.
    if (!xato.richtig) return null;
    const juftlar = xato.richtig.split("|").map((juft) => {
      const [chap, ong] = juft.split("=");
      return { chap: chap ?? "", ong: ong ?? "" };
    });
    return (
      <ul className="space-y-1">
        {juftlar.map((j, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-3 text-sm"
          >
            <span className="text-ink-600">{j.chap}</span>
            <span className="font-bold text-danger">{j.ong}</span>
          </li>
        ))}
      </ul>
    );
  }

  if (xato.format === "DIALOG_LUECKE") {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold text-ink-800">
          {xato.titel ?? t("Dialog")}
        </span>
        <span className="text-sm font-bold text-danger">{xato.richtig}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2.5 font-semibold text-ink-800">
        {/* Picture questions: the picture, never its URL, beside the word. */}
        {xato.bildUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={xato.bildUrl}
            alt=""
            className="size-10 shrink-0 rounded-lg bg-white object-cover"
          />
        ) : null}
        <DeWort text={xatoYorligi(xato.format, xato.prompt, t)} />
      </span>
      <DeWort text={xato.richtig} className="text-sm font-bold text-danger" />
    </div>
  );
}

/**
 * Seans tugagandan keyingi natija ekrani: ball, sarflangan vaqt va
 * xato qilingan so'zlar. To'g'ri javob har bir xato uchun `xatolar`
 * ichida allaqachon bor — bu ekran hech narsani qayta hisoblamaydi,
 * faqat `seans-navbat.ts` yig'gan holatni ko'rsatadi.
 *
 * Ball, seriya va o'rinni server `natija` sifatida qaytaradi — bu ekran
 * faqat ko'rsatadi (spec 2026-10-18 §5).
 */
export function NatijaEkrani({
  togri,
  jami,
  durationMs,
  xatolar,
  unitId,
  onQayta,
  natija,
  sinov,
  onNatijaQaytaYubor,
}: NatijaEkraniProps) {
  const t = useT();
  const router = useRouter();
  const davomHref = unitId
    ? `/portal/lernen/units/${unitId}`
    : "/portal/lernen";
  const korinish = sinov ? sinovKorinishi(sinov, t) : null;

  const qator = natijaQatorlari(natija, t);
  const sanaladiganBall = useSanaladiganBall(qator.ball);
  const yutuqlarBormi =
    qator.ball != null ||
    qator.serie != null ||
    qator.orin != null ||
    qator.maqsad != null ||
    qator.nishonlar.length > 0;

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

        {korinish ? (
          <Card
            role="status"
            aria-live="polite"
            className={cn(
              "space-y-1 text-center",
              korinish.ohang === "muvaffaqiyat" && "bg-success/10",
              korinish.ohang === "xavf" && "bg-danger/10",
            )}
          >
            <p className="font-display text-xl font-bold text-ink-900">
              {korinish.sarlavha}
            </p>
            <p className="font-semibold text-ink-600">{korinish.matn}</p>
          </Card>
        ) : null}

        {yutuqlarBormi ? (
          <Card className="flex flex-wrap items-center justify-center gap-2 text-center">
            {qator.ball != null && sanaladiganBall != null ? (
              <StatChip
                icon={<Star weight="fill" className="text-amber-500" />}
                value={t("+{n} ball", { n: sanaladiganBall })}
              />
            ) : null}
            {qator.serie != null ? (
              <StatChip
                icon={<Fire weight="fill" className="text-coral-500" />}
                value={t("{n} kun ketma-ket", { n: qator.serie })}
                label={t("seriya")}
              />
            ) : null}
            {qator.orin ? (
              <p className="w-full text-sm font-semibold text-ink-700">
                {qator.orin}
              </p>
            ) : null}
            {qator.maqsad ? (
              <p className="w-full text-sm font-bold text-success">{qator.maqsad}</p>
            ) : null}
            {qator.nishonlar.map((matn) => (
              <p key={matn} className="w-full text-sm font-bold text-ink-900">
                {matn}
              </p>
            ))}
          </Card>
        ) : null}

        <Card className="space-y-3">
          {xatolar.length === 0 ? (
            <p className="text-center font-semibold text-ink-700">
              {t("Hammasi to'g'ri — ajoyib natija!")}
            </p>
          ) : (
            <>
              <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-500">
                {t("Qaytarib ko'ring · {n}", { n: xatolar.length })}
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
          {korinish?.asosiy === "qayta-yubor" ? (
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => router.push(davomHref)}
              >
                {t("Mashqdan chiqish")}
              </Button>
              <Button className="flex-1" onClick={onNatijaQaytaYubor}>
                {t("Qayta yuborish")}
              </Button>
            </>
          ) : korinish?.asosiy === "qayta" ? (
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => router.push(davomHref)}
              >
                {t("Yo'lga qaytish")}
              </Button>
              <Button className="flex-1" onClick={onQayta}>
                {t("Qayta urinish")}
              </Button>
            </>
          ) : korinish?.asosiy === null ? (
            // Natija kutilmoqda: davom etish (o'tdi/o'tmadi noma'lum) o'chiq,
            // lekin CHIQISH ochiq — internet osilib qolsa o'quvchi bu ekranda
            // qamalib qolmasin (pastki menyu seans sahifasida yo'q). So'rov
            // fonda davom etadi va yo'l keshini o'zi yangilaydi.
            <>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => router.push(davomHref)}
              >
                {t("Mashqdan chiqish")}
              </Button>
              <Button className="flex-1" disabled>
                {t("Davom etish")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" className="flex-1" onClick={onQayta}>
                {korinish ? t("Qayta urinish") : t("Qayta o'tish")}
              </Button>
              <Button className="flex-1" onClick={() => router.push(davomHref)}>
                {t("Davom etish")}
              </Button>
            </>
          )}
        </div>
      </FadeIn>
    </div>
  );
}
