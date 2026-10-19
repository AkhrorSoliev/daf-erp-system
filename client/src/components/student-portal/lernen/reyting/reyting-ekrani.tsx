"use client";

import * as React from "react";
import {
  Badge,
  Card,
  LoadingCards,
  ProgressBar,
  Screen,
  SegmentedControl,
  StackHeader,
  type SegmentOption,
} from "../../lumio";
import { useFortschritt } from "../queries";
import { darajaFoizi, qisqaRaqam } from "../yol/yol-tuzilishi";
import { Nishonlarim } from "./nishonlarim";
import { EslatmalarQatori } from "./eslatmalar-qatori";
import { ReytingJadvali } from "./reyting-jadvali";
import { LigaTab } from "./liga-tab";
import { GuruhlarTab } from "./guruhlar-tab";
import { loadState } from "../../lib/load-state";
import { LoadFailed } from "../../load-failed";

type ReytingTab = "liga" | "guruhim" | "guruhlar" | "darajam";

/**
 * To'rt tab (spec S3 §5): 390 px da besh tab sig'maydi, shuning uchun eski
 * «Markaz» «Liga» ichiga «Butun markaz» bo'lib ko'chdi. Har tab o'z
 * so'rovini faqat chizilganda yuboradi.
 */
export const REYTING_TABLARI: SegmentOption<ReytingTab>[] = [
  { value: "liga", label: "Liga" },
  { value: "guruhim", label: "Guruhim" },
  { value: "guruhlar", label: "Guruhlar" },
  { value: "darajam", label: "Darajam" },
];

/**
 * Darajam — jadval emas, o'quvchining o'z o'sishi: umumiy ball, hozirgi
 * daraja (nemischa ustida, o'zbekcha ostida), keyingi darajagacha necha
 * ball qolgani.
 *
 * Foiz `darajaFoizi` orqali hisoblanadi — HOZIRGI band ichida qancha
 * bosib o'tilgani, `stufe.ab` dan `naechsteStufe.ab` gacha. Darajaga
 * endi kirgan o'quvchida chiziq nolga yaqin ko'rinadi, keyingi chegaraga
 * yetganda 100% bo'ladi. `gesamt / naechsteStufe.ab` bilan hisoblash
 * xato edi: u nolldan boshlaydi va Kenner'ga endi yetgan (1500/4000)
 * o'quvchini "keyingi darajagacha 37% qolgan" deb ko'rsatardi — aslida
 * u shu band boshida, hali hech narsa bosib o'tmagan.
 *
 * Ostida «Nishonlarim» (S2) — o'z so'rovi bilan, faqat shu tab ochilganda — va «Telegram eslatmalari» qatori (S4, `fortschritt` dan).
 */
function DarajamTab() {
  const query = useFortschritt();
  const { data } = query;

  if (loadState(query) === "loading") return <LoadingCards count={2} />;
  if (!data) return <LoadFailed query={query} />;

  const { gesamt, stufe, naechsteStufe } = data;
  const foiz = darajaFoizi(gesamt, stufe.ab, naechsteStufe?.ab ?? null);
  const qoldi = naechsteStufe ? Math.max(0, naechsteStufe.ab - gesamt) : 0;

  return (
    <div className="space-y-4">
      <Card className="space-y-6 text-center">
        <div>
          <p className="font-display text-4xl font-extrabold text-ink-900">
            {qisqaRaqam(gesamt)}
          </p>
          <p className="text-sm font-semibold text-ink-500">umumiy ball</p>
        </div>

        <div>
          <p className="font-display text-2xl font-extrabold text-ink-900">
            {stufe.de}
          </p>
          <p className="text-sm font-semibold text-ink-500">{stufe.uz}</p>
        </div>

        {naechsteStufe ? (
          <div className="space-y-1.5 text-left">
            <ProgressBar value={foiz} />
            <p className="text-xs font-semibold text-ink-500">
              {naechsteStufe.de} ({naechsteStufe.uz}) darajagacha{" "}
              {qisqaRaqam(qoldi)} ball qoldi
            </p>
          </div>
        ) : (
          <Badge tone="amber" size="md" className="mx-auto">
            Eng yuqori daraja
          </Badge>
        )}
      </Card>
      <Nishonlarim />
      <EslatmalarQatori />
    </div>
  );
}

export function ReytingEkrani() {
  const [tab, setTab] = React.useState<ReytingTab>("liga");

  return (
    <Screen narrow>
      <StackHeader title="Reyting" backHref="/portal/lernen" />
      <div role="group" aria-label="Reyting bo'limlari">
        <SegmentedControl<ReytingTab> options={REYTING_TABLARI} value={tab} onChange={setTab} />
      </div>

      {tab === "liga" ? (
        <LigaTab />
      ) : tab === "guruhim" ? (
        <ReytingJadvali scope="gruppe" />
      ) : tab === "guruhlar" ? (
        <GuruhlarTab />
      ) : (
        <DarajamTab />
      )}
    </Screen>
  );
}
