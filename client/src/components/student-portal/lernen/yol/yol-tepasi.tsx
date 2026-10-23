"use client";

import * as React from "react";
import Link from "next/link";
import { Fire, Medal, Star, Trophy } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { Skeleton } from "../../lumio";
import { useFortschritt } from "../queries";
import { MaqsadKartasi } from "./maqsad-kartasi";
import { qisqaRaqam } from "./yol-tuzilishi";

/**
 * Bitta belgi: piktogramma + son; `sm`dan boshlab son o'rniga to'liq yozuv
 * (`wide`, masalan «120 ball») — tarjimada son so'zning oldida yoki ortida
 * turishi mumkin, shuning uchun yozuv sondan alohida qo'shilmaydi.
 */
function Belgi({
  icon,
  tone,
  value,
  wide,
  href,
  ariaLabel,
}: {
  icon: React.ReactNode;
  tone: string;
  value: React.ReactNode;
  wide?: string;
  href?: string;
  ariaLabel?: string;
}) {
  const badan = (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-2.5 py-1.5 shadow-lumio-sm">
      {/* `aria-hidden` — atrofdagi matn (qiymat + `ariaLabel`) ma'noni
          allaqachon o'z ichiga oladi, ikonka faqat vizual bezak; usiz
          skrin-rider har belgini ikki marta (SVG + matn) e'lon qilardi. */}
      <span aria-hidden className={cn("inline-flex shrink-0 text-base", tone)}>
        {icon}
      </span>
      <span className="whitespace-nowrap font-display text-sm font-extrabold leading-none text-ink-900">
        {wide ? (
          <>
            <span className="sm:hidden">{value}</span>
            <span className="hidden sm:inline">{wide}</span>
          </>
        ) : (
          value
        )}
      </span>
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className="shrink-0 transition-transform active:translate-y-[1px]"
      >
        {badan}
      </Link>
    );
  }
  return <span className="shrink-0">{badan}</span>;
}

/**
 * Skelet holati — belgilar yo'q bo'lib ketmaydi, sahifa sakramaydi. Maqsad kartasi
 * (81 px + 12 px oraliq) uchun ham joy qoldiriladi: usiz ma'lumot kelgach butun
 * yo'l 93 px pastga tushardi.
 */
export function YolTepasiSkelet() {
  return (
    <div aria-hidden className="space-y-3">
      <div className="flex items-center gap-1.5 sm:gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-pill sm:w-20" />
        ))}
      </div>
      <Skeleton className="h-[81px] sm:max-w-md" />
    </div>
  );
}

/**
 * Yo'l tepasidagi to'rtta belgi: daraja, ball, seriya, haftalik o'rin.
 *
 * Faqat o'rin belgisi bosiladi — u reyting ekraniga olib boradi. Qolgan
 * uchtasi ma'lumot ko'rsatish uchun, harakatga chaqirmaydi.
 *
 * O'rin sifatida MARKAZ o'rni (`wochePlatzZentrum`) ko'rsatiladi, guruh
 * o'rni emas — u guruhi yo'q o'quvchida `null` bo'lishi mumkin, tepa
 * qism esa har doim to'rtta belgini ko'rsatishi kerak.
 *
 * `useFortschritt` yiqilsa BUTUNLAY yashiriladi. Ball ekranning bezagi,
 * maqsadi emas — mashqning o'zi maqsad, shuning uchun bu yon so'rovning
 * qulashi butun yo'lni to'sishi noto'g'ri bo'lardi.
 *
 * Ostida kunlik maqsad kartasi (S2) — to'rt belgidan keyingi qator, telefonda to'liq kenglikda.
 */
export function YolTepasi() {
  const t = useT();
  const { data, isLoading, isError } = useFortschritt();

  if (isError) return null;
  if (isLoading) return <YolTepasiSkelet />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Belgi
          icon={<Medal size={18} weight="fill" />}
          tone="text-grape-500"
          value={data.stufe.de}
        />
        <Belgi
          icon={<Star size={18} weight="fill" />}
          tone="text-amber-500"
          value={qisqaRaqam(data.gesamt)}
          wide={t("{n} ball", { n: qisqaRaqam(data.gesamt) })}
        />
        <Belgi
          icon={<Fire size={18} weight="fill" />}
          tone="text-coral-500"
          value={qisqaRaqam(data.serie)}
          wide={t("{n} kun", { n: qisqaRaqam(data.serie) })}
        />
        <Belgi
          icon={<Trophy size={18} weight="fill" />}
          tone="text-sky-500"
          value={qisqaRaqam(data.wochePlatzZentrum)}
          wide={t("{n}-o'rin", { n: qisqaRaqam(data.wochePlatzZentrum) })}
          href="/portal/lernen/reyting"
          ariaLabel={t("Reyting: {n}-o'rin", { n: data.wochePlatzZentrum })}
        />
      </div>
      {data.maqsad ? (
        <div className="sm:max-w-md">
          <MaqsadKartasi maqsad={data.maqsad} />
        </div>
      ) : null}
    </div>
  );
}
