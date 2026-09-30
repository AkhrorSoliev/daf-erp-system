"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { yangiliklar } from "@/qollanma/yangiliklar";
import { engYangiSana, yangiliklarRolUchun } from "@/qollanma/yangiliklar-holati";
import { oxirgiKorilganniYoz } from "@/qollanma/yangiliklar-xotira";
import { sahifaTopish, sahifaYoli } from "@/qollanma/sahifalar";
import { sanaKorinishi } from "@/qollanma/sana";

export function YangiliklarRoyxati() {
  const user = useAuth((s) => s.user);

  useEffect(() => {
    const eng = engYangiSana(yangiliklar);
    if (eng) oxirgiKorilganniYoz(eng);
  }, []);

  const royxat = user ? yangiliklarRolUchun(yangiliklar, user.roles.map((r) => r.id)) : null;

  return (
    <div className="space-y-6 pb-16">
      <header>
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">Nima yangi</h1>
        <p className="mt-1 text-muted-foreground">Tizimdagi o&apos;zgarishlar, eng yangisi tepada.</p>
      </header>
      {royxat === null ? (
        <Skeleton className="h-24 w-full" />
      ) : royxat.length === 0 ? (
        <p className="text-muted-foreground">Hozircha yangilik yo&apos;q.</p>
      ) : (
        <ol className="space-y-4">
          {royxat.map((y) => {
            const bogliq = y.sahifa ? sahifaTopish(y.sahifa.bolim, y.sahifa.sahifa) : undefined;
            return (
              <li key={`${y.sana}-${y.sarlavha}`} className="rounded-lg border p-4">
                <p className="text-xs text-muted-foreground">{sanaKorinishi(y.sana)}</p>
                <p className="mt-1 font-medium">{y.sarlavha}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{y.matn}</p>
                {bogliq ? (
                  <Link href={sahifaYoli(bogliq)} className="mt-2 inline-block text-sm text-primary hover:underline">
                    Batafsil: {bogliq.sarlavha}
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
