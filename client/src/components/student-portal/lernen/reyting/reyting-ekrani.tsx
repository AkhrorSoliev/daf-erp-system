"use client";

import * as React from "react";
import { Trophy, UsersThree, WarningCircle } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  LoadingCards,
  ProgressBar,
  Screen,
  SegmentedControl,
  StackHeader,
  type SegmentOption,
} from "../../lumio";
import { useFortschritt, useReyting } from "../queries";
import { darajaFoizi, qisqaRaqam } from "../yol/yol-tuzilishi";
import type { ReytingZeile } from "../types";

type ReytingTab = "guruhim" | "markaz" | "darajam";

const TABS: SegmentOption<ReytingTab>[] = [
  { value: "guruhim", label: "Guruhim" },
  { value: "markaz", label: "Markaz" },
  { value: "darajam", label: "Darajam" },
];

/** Umumiy "yuklab bo'lmadi" holati — ikkala jadval va Darajam bir xil ishlatadi. */
function ReytingXatosi({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={<WarningCircle size={28} weight="bold" />}
      title="Reytingni ochib bo'lmadi"
      description="Internet aloqasini tekshirib, qayta urinib ko'ring."
      action={
        <Button variant="secondary" onClick={onRetry}>
          Qayta urinish
        </Button>
      }
    />
  );
}

function ReytingQatori({ qator }: { qator: ReytingZeile }) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-card border px-3 py-2.5",
        qator.selbst
          ? "border-coral-500 bg-coral-500/8"
          : "border-line bg-surface",
      )}
    >
      <span className="w-6 shrink-0 text-center font-display text-sm font-extrabold text-ink-500">
        {qator.platz}
      </span>
      <Avatar name={qator.name} size={32} />
      {/* Ism TO'LIQ va QISQARTIRILMAYDI — dizayn 6.1: markaz jadvali
          ataylab barcha filiallarni aralashtiradi, bu leak emas, CEO
          qarori. */}
      <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">
        {qator.name}
      </span>
      <span className="shrink-0 font-display text-sm font-extrabold text-ink-900">
        {qisqaRaqam(qator.punkte)} ball
      </span>
    </div>
  );
}

/**
 * Guruhim/Markaz jadvali — bitta komponent, `scope` orqali farqlanadi.
 *
 * Ikkala tomon ham bo'sh ro'yxat qaytarishi mumkin, lekin sabab har xil:
 * guruhda `[]` deyarli har doim "guruhi yo'q" degani (server rosterni
 * nol ball bilan to'ldiradi, ya'ni a'zo bo'lsa qator bo'ladi), markazda
 * esa haqiqiy "hali hech kim mashq qilmagan". Shu farq ikki xil xabar
 * beradi.
 */
function ReytingJadvali({ scope }: { scope: "gruppe" | "zentrum" }) {
  const { data, isLoading, isError, refetch } = useReyting(scope);

  if (isLoading) return <LoadingCards count={4} />;
  if (isError || !data) return <ReytingXatosi onRetry={() => void refetch()} />;

  if (data.length === 0) {
    return scope === "gruppe" ? (
      <EmptyState
        icon={<UsersThree size={28} weight="bold" />}
        title="Siz hali guruhga qo'shilmagansiz"
        description="Guruhga qo'shilgach, guruhdoshlaringiz bilan haftalik ballaringizni solishtira olasiz."
      />
    ) : (
      <EmptyState
        icon={<Trophy size={28} weight="bold" />}
        title="Bu hafta hali hech kim ball to'plamagan"
        description="Birinchi bo'lib mashq qiling — jadval boshida siz turasiz."
      />
    );
  }

  return (
    <div className="space-y-2">
      {data.map((qator) => (
        <ReytingQatori key={qator.studentId} qator={qator} />
      ))}
    </div>
  );
}

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
 */
function DarajamTab() {
  const { data, isLoading, isError, refetch } = useFortschritt();

  if (isLoading) return <LoadingCards count={2} />;
  if (isError || !data) return <ReytingXatosi onRetry={() => void refetch()} />;

  const { gesamt, stufe, naechsteStufe } = data;
  const foiz = darajaFoizi(gesamt, stufe.ab, naechsteStufe?.ab ?? null);
  const qoldi = naechsteStufe ? Math.max(0, naechsteStufe.ab - gesamt) : 0;

  return (
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
  );
}

export function ReytingEkrani() {
  const [tab, setTab] = React.useState<ReytingTab>("guruhim");

  return (
    <Screen narrow>
      <StackHeader title="Reyting" backHref="/portal/lernen" />
      <SegmentedControl<ReytingTab> options={TABS} value={tab} onChange={setTab} />

      {tab === "guruhim" ? (
        <ReytingJadvali scope="gruppe" />
      ) : tab === "markaz" ? (
        <ReytingJadvali scope="zentrum" />
      ) : (
        <DarajamTab />
      )}
    </Screen>
  );
}
