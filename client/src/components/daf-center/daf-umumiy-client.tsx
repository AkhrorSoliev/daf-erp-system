"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError, PeriodToggle, usePeriodParam } from "@/components/groups/app-activity/activity-ui";
import { DafExplainer } from "./daf-explainer";
import { DafFiliallarTable } from "./daf-filiallar-table";
import { DafKpiCards } from "./daf-kpi-cards";
import { DafTrendChart } from "./daf-trend-chart";
import { DafVoronka } from "./daf-voronka";
import { useMarkazUmumiy } from "./use-daf-center";

function SahifaSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export function DafUmumiyClient() {
  const [davr, setDavr] = usePeriodParam();
  const { data, isLoading, isError, refetch } = useMarkazUmumiy(davr);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold tracking-tight">DaF ilovasi — umumiy holat</h1>
          <p className="text-sm text-muted-foreground">
            Filial yuqoridagi tanlagichdan; veb, Android va iOS bir xil qoida bilan sanaladi
          </p>
        </div>
        <PeriodToggle value={davr} onChange={setDavr} />
      </div>

      {isLoading ? (
        <SahifaSkeleton />
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : data.kartalar.oquvchilar === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">Tanlangan filialda faol o&apos;quvchi yo&apos;q</p>
        </div>
      ) : (
        <>
          <DafKpiCards k={data.kartalar} norma={data.norma} />
          <div className="grid gap-4 lg:grid-cols-2">
            <DafVoronka voronka={data.voronka} davr={davr} />
            <DafTrendChart trend={data.trend} />
          </div>
          {data.filiallar.length > 0 && <DafFiliallarTable qatorlar={data.filiallar} />}
          <DafExplainer norma={data.norma} kuzatuvBoshi={data.kuzatuvBoshi} />
        </>
      )}
    </div>
  );
}
