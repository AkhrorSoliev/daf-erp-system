"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { bolimlar, bolimTopish } from "@/qollanma/bolimlar";
import { sahifalar, sahifaYoli } from "@/qollanma/sahifalar";
import { bolimlarRolUchun, sahifalarRolUchun } from "@/qollanma/rol-filtri";
import { qidir } from "@/qollanma/qidiruv";
import { SahifaKartalari } from "./qollanma-sahifa-kartalari";

const QIDIRUV_SXEMASI = { q: { type: "string", defaultValue: "" } } as const;

export function QollanmaBoshSahifa() {
  const user = useAuth((s) => s.user);
  const { filters, setFilter } = useUrlFilters(QIDIRUV_SXEMASI);
  // Yozilgan, lekin hali URL'ga yetib bormagan matn (`null` — maydon URL'ni ko'rsatadi).
  // Havola yoki «orqaga» tugmasidan kelgan o'zgarish maydonga o'zi tushadi; o'z yozuvimiz
  // qaytganda matn tegilmaydi. "Oxirgi yozilganni saqlash" bu yerda ishlamaydi: router.replace
  // URL'ni keyinroq yangilaydi, oraliqda maydon eski URL'ga qaytib, terilgan harflar yo'qoladi.
  const [taslak, setTaslak] = useState<string | null>(null);
  if (taslak !== null && taslak === filters.q) setTaslak(null);
  const matn = taslak ?? filters.q;
  const taymer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Sahifadan chiqilganda kutayotgan yozuv URL'ga tushmasin (router.replace eski yo'lga qaytarmasin).
  useEffect(() => () => clearTimeout(taymer.current), []);

  // URL hodisa ishlovchisidan yoziladi (effekt ichidan emas) — client/CLAUDE.md.
  function ozgardi(qiymat: string) {
    setTaslak(qiymat);
    clearTimeout(taymer.current);
    taymer.current = setTimeout(() => setFilter("q", qiymat), 250);
  }

  const rollar = user?.roles.map((r) => r.id) ?? [];
  const natijalar = qidir(sahifalarRolUchun(sahifalar, rollar), matn);

  return (
    <div className="space-y-8 pb-16">
      <header>
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">Qo&apos;llanma</h1>
        <p className="mt-1 text-muted-foreground">Tizim qoidalari va ish tartibi — oddiy tilda.</p>
      </header>

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={matn}
          onChange={(e) => ozgardi(e.target.value)}
          placeholder="Qo'llanmadan qidirish..."
          className="pl-9"
          aria-label="Qo'llanmadan qidirish"
        />
      </div>

      {!user ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : matn.trim() ? (
        natijalar.length === 0 ? (
          <p className="text-muted-foreground">Hech narsa topilmadi — boshqa so&apos;z bilan qidirib ko&apos;ring.</p>
        ) : (
          <ul className="space-y-3">
            {natijalar.map((s) => (
              <li key={sahifaYoli(s)}>
                <Link href={sahifaYoli(s)} className="block rounded-lg border p-4 transition-colors hover:bg-muted/50">
                  <span className="text-xs text-muted-foreground">{bolimTopish(s.bolim)?.nom}</span>
                  <span className="mt-0.5 block font-medium">{s.sarlavha}</span>
                  <span className="mt-1 block text-sm leading-6 text-muted-foreground">{s.qisqacha}</span>
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-10">
          {bolimlarRolUchun(bolimlar, sahifalar, rollar).map(({ bolim, sahifalar: royxat }) => (
            <section key={bolim.id} aria-labelledby={`bolim-${bolim.id}`}>
              <h2 id={`bolim-${bolim.id}`} className="mb-3 flex items-center gap-2 font-heading text-lg font-semibold">
                <bolim.icon className="size-5 text-muted-foreground" aria-hidden />
                <Link href={`/qollanma/${bolim.id}`} className="hover:underline">
                  {bolim.nom}
                </Link>
              </h2>
              <SahifaKartalari royxat={royxat} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
