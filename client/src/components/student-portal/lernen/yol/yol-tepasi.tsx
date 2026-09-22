"use client";

import * as React from "react";
import Link from "next/link";
import { Fire, Medal, Star, Trophy } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "../../lumio";
import { useFortschritt } from "../queries";
import { qisqaRaqam } from "./yol-tuzilishi";

/**
 * Bitta belgi: piktogramma + son, `sm`dan boshlab qo'shimcha yozuv bilan.
 *
 * Ikkinchi razmetka QURILMAYDI — yozuv bitta `<span>` ichida
 * `hidden sm:inline` bilan yashiriladi/ko'rsatiladi, xuddi shu DOM ikkala
 * o'lchamda ham xizmat qiladi.
 */
function Belgi({
  icon,
  tone,
  value,
  suffix,
  href,
  ariaLabel,
}: {
  icon: React.ReactNode;
  tone: string;
  value: React.ReactNode;
  suffix?: string;
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
        {value}
        {suffix ? <span className="hidden sm:inline">{suffix}</span> : null}
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

/** Skelet holati — belgilar yo'q bo'lib ketmaydi, sahifa sakramaydi. */
function YolTepasiSkelet() {
  return (
    <div aria-hidden className="flex items-center gap-1.5 sm:gap-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-16 rounded-pill sm:w-20" />
      ))}
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
 */
export function YolTepasi() {
  const { data, isLoading, isError } = useFortschritt();

  if (isError) return null;
  if (isLoading) return <YolTepasiSkelet />;
  if (!data) return null;

  return (
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
        suffix=" ball"
      />
      <Belgi
        icon={<Fire size={18} weight="fill" />}
        tone="text-coral-500"
        value={qisqaRaqam(data.serie)}
        suffix=" kun"
      />
      <Belgi
        icon={<Trophy size={18} weight="fill" />}
        tone="text-sky-500"
        value={qisqaRaqam(data.wochePlatzZentrum)}
        suffix="-o'rin"
        href="/portal/lernen/reyting"
        ariaLabel={`Reyting: ${data.wochePlatzZentrum}-o'rin`}
      />
    </div>
  );
}
