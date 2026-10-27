"use client";

import Link from "next/link";
import { Sword } from "@phosphor-icons/react";
import { Card } from "../../lumio";
import { useT } from "@/i18n/use-t";
import { useJangHolati } from "../queries";

/** Ta'lim sahifasidagi jang kirishi. `DAF_JANG` o'chiq bo'lsa umuman ko'rinmaydi. */
export function JangKarta() {
  const t = useT();
  const { data } = useJangHolati();
  if (!data?.yoqilgan) return null;
  if (!data.ochiq) {
    return (
      <Card className="flex items-center gap-3 opacity-70">
        <Sword size={28} weight="bold" />
        <p className="text-ink-700">{t("Jang tez orada ochiladi")}</p>
      </Card>
    );
  }
  const ichi = (
    <Card className="flex items-center gap-3">
      <Sword size={28} weight="bold" />
      <div className="min-w-0 flex-1">
        <p className="font-display font-extrabold text-ink-900">{t("Jang")}</p>
        <p className="text-sm text-ink-500">
          {t("{n} ta g'alaba", { n: data.golibSoni })} · {t("Seriya: {n}", { n: data.seriya })}
        </p>
      </div>
      <p className="text-right text-sm font-semibold text-ink-700">
        {data.bugunQoldi > 0 ? t("Bugun {n} ta qoldi", { n: data.bugunQoldi }) : t("Bugungi janglar tugadi")}
      </p>
    </Card>
  );
  return data.bugunQoldi > 0 ? <Link href="/portal/lernen/jang">{ichi}</Link> : ichi;
}
