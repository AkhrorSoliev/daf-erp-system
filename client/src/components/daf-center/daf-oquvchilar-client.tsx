"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError } from "@/components/groups/app-activity/activity-ui";
import { DafOquvchiSheet } from "./daf-oquvchi-sheet";
import { DafOquvchilarFilterBar } from "./daf-oquvchilar-filter-bar";
import { DafOquvchilarTable } from "./daf-oquvchilar-table";
import { DafRoyxatNusxalash } from "./daf-royxat-nusxalash";
import { filtrniUrldanOqi, filtrniUrlgaYoz, type OquvchilarFiltri } from "./oquvchilar-filtr";
import type { Saralash } from "./types";
import { useMarkazOquvchilar } from "./use-daf-center";

export function DafOquvchilarClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Holat URL da (dizayn 6.1) — havola bilan ulashiladi, voronka shu yerga olib keladi.
  const filtr = useMemo(() => filtrniUrldanOqi(new URLSearchParams(searchParams.toString())), [searchParams]);
  const setFiltr = useCallback(
    (next: OquvchilarFiltri) => router.replace(`${pathname}${filtrniUrlgaYoz(next)}`, { scroll: false }),
    [router, pathname],
  );

  const { data, isLoading, isError, isFetching, refetch } = useMarkazOquvchilar(filtr);
  const [tanlangan, setTanlangan] = useState<number | null>(null);

  const sarala = (kalit: Saralash) =>
    setFiltr({
      ...filtr,
      sort: kalit,
      dir: filtr.sort === kalit && filtr.dir === "asc" ? "desc" : "asc",
      page: 1,
    });

  const oxirgiSahifa = data ? Math.max(1, Math.ceil(data.jami / data.sahifaHajmi)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-xl font-bold tracking-tight">DaF ilovasi — o&apos;quvchilar</h1>
        <p className="text-sm text-muted-foreground">
          Kim ishlamayapti — eng muammolisi yuqorida. Qatorga bosing: o&apos;quvchining to&apos;liq surati
        </p>
      </div>

      <DafOquvchilarFilterBar filtr={filtr} variantlar={data?.filtrVariantlari} onChange={setFiltr} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{data.jami}</span> ta o&apos;quvchi topildi
              {isFetching && " · yangilanmoqda…"}
            </p>
            <DafRoyxatNusxalash filtr={filtr} jami={data.jami} />
          </div>

          {data.qatorlar.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border">
              <p className="text-sm text-muted-foreground">Bu filtrga mos o&apos;quvchi yo&apos;q</p>
            </div>
          ) : (
            <DafOquvchilarTable
              qatorlar={data.qatorlar}
              sahifa={data.sahifa}
              sahifaHajmi={data.sahifaHajmi}
              filialUstuni={data.filialUstuni}
              sort={filtr.sort}
              dir={filtr.dir}
              onSort={sarala}
              onSelect={setTanlangan}
              selectedId={tanlangan}
            />
          )}

          {oxirgiSahifa > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" disabled={data.sahifa <= 1} onClick={() => setFiltr({ ...filtr, page: data.sahifa - 1 })}>
                <ChevronLeft className="mr-1 size-4" /> Oldingi
              </Button>
              <span className="text-sm tabular-nums">{data.sahifa} / {oxirgiSahifa}</span>
              <Button variant="outline" size="sm" disabled={data.sahifa >= oxirgiSahifa} onClick={() => setFiltr({ ...filtr, page: data.sahifa + 1 })}>
                Keyingi <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          )}
        </>
      )}

      <DafOquvchiSheet
        studentId={tanlangan}
        davr={filtr.davr}
        onDavrChange={(davr) => setFiltr({ ...filtr, davr, page: 1 })}
        onClose={() => setTanlangan(null)}
      />
    </div>
  );
}
