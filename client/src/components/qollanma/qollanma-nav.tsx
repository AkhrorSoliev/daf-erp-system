"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { bolimlar } from "@/qollanma/bolimlar";
import { sahifalar, sahifaYoli } from "@/qollanma/sahifalar";
import { bolimlarRolUchun } from "@/qollanma/rol-filtri";

function havolaKlassi(faol: boolean) {
  return cn(
    "block rounded-md px-2 py-1.5 text-sm transition-colors",
    faol ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
  );
}

export function QollanmaNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const user = useAuth((s) => s.user);

  if (!user) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-5 w-full" />
        ))}
      </div>
    );
  }

  const guruhlar = bolimlarRolUchun(bolimlar, sahifalar, user.roles.map((r) => r.id));

  return (
    <nav aria-label="Qo'llanma bo'limlari" className="space-y-6">
      <div className="space-y-0.5">
        <Link href="/qollanma" onClick={onNavigate} className={havolaKlassi(pathname === "/qollanma")}>
          Bosh sahifa
        </Link>
        <Link
          href="/qollanma/yangiliklar"
          onClick={onNavigate}
          className={havolaKlassi(pathname === "/qollanma/yangiliklar")}
        >
          Nima yangi
        </Link>
      </div>
      {guruhlar.map(({ bolim, sahifalar: royxat }) => (
        <div key={bolim.id}>
          <Link
            href={`/qollanma/${bolim.id}`}
            onClick={onNavigate}
            className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            <bolim.icon className="size-3.5" aria-hidden />
            {bolim.nom}
          </Link>
          <ul className="space-y-0.5">
            {royxat.map((s) => {
              const href = sahifaYoli(s);
              return (
                <li key={href}>
                  <Link href={href} onClick={onNavigate} className={havolaKlassi(pathname === href)}>
                    {s.sarlavha}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
