"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { QollanmaBolim } from "@/qollanma/turlar";
import { sahifalar } from "@/qollanma/sahifalar";
import { sahifalarRolUchun } from "@/qollanma/rol-filtri";
import { QollanmaBreadcrumbNomi } from "./qollanma-breadcrumb-nomi";
import { SahifaKartalari } from "./qollanma-sahifa-kartalari";

export function QollanmaBolimSahifasi({ bolim }: { bolim: Pick<QollanmaBolim, "id" | "nom" | "tavsif"> }) {
  const user = useAuth((s) => s.user);
  const royxat = user
    ? sahifalarRolUchun(
        sahifalar.filter((s) => s.bolim === bolim.id),
        user.roles.map((r) => r.id),
      )
    : null;

  return (
    <div className="space-y-6 pb-16">
      <QollanmaBreadcrumbNomi nomlar={{ [bolim.id]: bolim.nom }} />
      <header>
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">{bolim.nom}</h1>
        <p className="mt-1 text-muted-foreground">{bolim.tavsif}</p>
      </header>
      {royxat === null ? (
        <Skeleton className="h-24 w-full" />
      ) : royxat.length === 0 ? (
        <p className="text-muted-foreground">Bu bo&apos;limda sizning rolingizga tegishli sahifa yo&apos;q.</p>
      ) : (
        <SahifaKartalari royxat={royxat} />
      )}
    </div>
  );
}
