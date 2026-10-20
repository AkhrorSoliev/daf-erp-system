"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError } from "../app-activity/activity-ui";
import { useT } from "@/i18n/context";
import { GuruhOrniKarta } from "./guruh-orni-karta";
import { haftaYorligi } from "./musobaqa-format";
import { MashqQilmadi } from "./mashq-qilmadi";
import { OquvchilarJadvali } from "./oquvchilar-jadvali";
import { useMusobaqa } from "./use-musobaqa";

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}

export function GroupMusobaqaTab({ groupId }: { groupId: string }) {
  const t = useT();
  const [hafta, setHafta] = useState<string | null>(null);
  const { data, isLoading, isError, refetch } = useMusobaqa(groupId, hafta);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{t("Guruhning musobaqadagi natijasi")}</h3>
          <p className="text-sm text-muted-foreground">{t("Hozirgi a'zolar bo'yicha, hafta dushanbadan yakshanbagacha")}</p>
        </div>
        {data && (
          <div className="flex flex-col gap-1">
            <label htmlFor="musobaqa-hafta" className="text-muted-foreground text-xs">
              {t("Hafta")}
            </label>
            <select
              id="musobaqa-hafta"
              value={data.haftaBoshi}
              onChange={(e) => setHafta(e.target.value === data.haftalar[0] ? null : e.target.value)}
              className="min-h-11 rounded-md border bg-background px-3 text-sm"
            >
              {data.haftalar.map((h, i) => (
                <option key={h} value={h}>
                  {haftaYorligi(h)}
                  {i === 0 ? ` (${t("joriy")})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : (
        <>
          <GuruhOrniKarta data={data} onHafta={setHafta} />
          {data.oquvchilar.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-md border">
              <p className="text-sm text-muted-foreground">{t("Guruhda faol o'quvchi yo'q")}</p>
            </div>
          ) : (
            <>
              <MashqQilmadi data={data} />
              <OquvchilarJadvali data={data} />
            </>
          )}
        </>
      )}
    </div>
  );
}
