"use client";

import { useState } from "react";
import { BookOpenCheck, Clock, Radio, Target, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityError, KpiCard, PeriodToggle, usePeriodParam } from "./activity-ui";
import { formatDavomiylik, foizRangi } from "./activity-format";
import { DifficultItems } from "./difficult-items";
import { GroupActivityTable } from "./group-activity-table";
import { ActivityExplainer } from "./activity-explainer";
import { useGuruhFaolligi } from "./use-app-activity";

function TabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}

export function GroupAppActivityTab({ groupId }: { groupId: string }) {
  const [davr, setDavr] = usePeriodParam();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data, isLoading, isError, refetch } = useGuruhFaolligi(groupId, davr);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">O&apos;quvchilarning ilovadagi faolligi</h3>
          <p className="text-sm text-muted-foreground">Veb, Android va iOS bir xil qoida bilan sanaladi</p>
        </div>
        <PeriodToggle value={davr} onChange={setDavr} />
      </div>

      {isLoading ? (
        <TabSkeleton />
      ) : isError || !data ? (
        <ActivityError onRetry={() => void refetch()} />
      ) : data.oquvchilar.length === 0 ? (
        <div className="flex h-24 items-center justify-center rounded-md border">
          <p className="text-sm text-muted-foreground">Guruhda faol o&apos;quvchi yo&apos;q</p>
        </div>
      ) : (
        <>
          {(() => {
            const k = data.kartalar;
            const akkauntsiz = k.oquvchilar - k.akkauntlar;
            const kirmaganlar = k.akkauntlar - k.kirganlar;
            return (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                <KpiCard
                  icon={Users}
                  label="Ilovaga kirdi"
                  value={`${k.kirganlar} / ${k.oquvchilar}`}
                  hint={
                    akkauntsiz > 0
                      ? `${akkauntsiz} nafarida akkaunt yo'q`
                      : kirmaganlar > 0
                        ? `${kirmaganlar} nafari kirmagan`
                        : "Hammasi kirgan"
                  }
                  tooltip="Tanlangan davrda kamida 10 soniya faol bo'lgan o'quvchilar."
                />
                <KpiCard
                  icon={Clock}
                  label="O'rtacha faol vaqt"
                  value={k.ortachaFaolSoniya === null ? "—" : formatDavomiylik(k.ortachaFaolSoniya)}
                  hint="kirganlar orasida, bir o'quvchiga"
                  tooltip="Faol vaqt: ilova ekranda ochiq va o'quvchi oxirgi 2 daqiqada biror harakat qilgan. Radio bunga kirmaydi."
                />
                <KpiCard
                  icon={Target}
                  label="To'g'ri javob"
                  value={k.foiz === null ? "—" : `${k.foiz}%`}
                  valueClassName={foizRangi(k.foiz)}
                  hint={`birinchi urinishda · ${k.savollar} savol`}
                  tooltip="Har bir savol birinchi so'ralganda to'g'ri topilgani. Xatodan keyin qayta so'ralgandagi javob bu foizga kirmaydi."
                />
                <KpiCard
                  icon={BookOpenCheck}
                  label="Tugatilgan darslar"
                  value={String(k.tugatilganDarslar)}
                  hint="davrda, har dars bir marta"
                  tooltip="Davrda oxirigacha ishlangan turli darslar. Bitta darsni qayta ishlash qo'shimcha sanalmaydi."
                />
                <KpiCard
                  icon={Radio}
                  label="Radio"
                  value={formatDavomiylik(k.radioSoniya)}
                  hint={`${k.radioTinglaganlar} o'quvchi tingladi`}
                  tooltip="Ovoz haqiqatan yangragan vaqt. Ekran yopiq bo'lsa ham sanaladi, lekin faol vaqtga qo'shilmaydi."
                />
              </div>
            );
          })()}
          <GroupActivityTable
            oquvchilar={data.oquvchilar}
            davr={davr}
            guruhDarajasi={data.guruhDarajasi}
            onSelect={setSelectedId}
            selectedId={selectedId}
          />
          <DifficultItems items={data.qiyinElementlar} />
          <ActivityExplainer kuzatuvBoshi={data.kuzatuvBoshi} />
        </>
      )}
    </div>
  );
}
