"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { SettingsPageHeader } from "./settings-page-header";
import {
  EXIT_TYPE_OPTIONS,
  ReasonListManager,
} from "./reason-list-manager";

const TABS = ["exit", "transfer", "teacher-change"] as const;

const reasonsSchema = {
  tab: { type: "string" as const, defaultValue: "exit" },
};

/**
 * One home for the three reason lists the app asks staff to pick from.
 *
 * They used to live in three different places — one dialog behind the
 * departed-students report's ⚙, and two dialogs behind report charts that
 * were removed in 05c82f4, taking the only way to edit transfer and
 * teacher-change reasons with them. The pickers kept requiring a reason that
 * nobody could add any more.
 */
export function ReasonsSettingsClient() {
  const { filters, setFilter } = useUrlFilters(reasonsSchema);
  const tab = (TABS as readonly string[]).includes(filters.tab)
    ? filters.tab
    : "exit";

  return (
    <div className="space-y-4">
      <SettingsPageHeader
        title="Sabablar"
        description="O'quvchi guruhdan chiqarilganda, boshqa guruhga o'tkazilganda va guruh ustozi almashganda tanlanadigan sabablar"
      />

      <Tabs value={tab} onValueChange={(v) => setFilter("tab", v)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="exit">Chiqish va status</TabsTrigger>
          <TabsTrigger value="transfer">Guruh almashtirish</TabsTrigger>
          <TabsTrigger value="teacher-change">Ustoz o&apos;zgarishi</TabsTrigger>
        </TabsList>

        <TabsContent value="exit" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            O&apos;quvchi guruhdan chiqarilganda, muzlatilganda, chetlatilganda
            yoki arxivlanganda ko&apos;rsatiladi. Har bir sabab qaysi holatlarda
            chiqishini belgilab qo&apos;ying.
          </p>
          <ReasonListManager
            endpoint="/student-exit-reasons"
            queryKey="student-exit-reasons"
            addPlaceholder="Yangi chiqish sababi"
            tags={{
              label: "Qaysi holatlarga taalluqli:",
              options: EXIT_TYPE_OPTIONS,
              defaultValue: ["GROUP_REMOVAL"],
            }}
          />
        </TabsContent>

        <TabsContent value="transfer" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            O&apos;quvchi ustozi boshqa bo&apos;lgan guruhga o&apos;tkazilganda
            sabab tanlash majburiy. Bu ro&apos;yxat bo&apos;sh bo&apos;lsa
            o&apos;tkazish umuman bajarilmaydi.
          </p>
          <ReasonListManager
            endpoint="/enrollment-transfer-reasons"
            queryKey="enrollment-transfer-reasons"
            addPlaceholder="Yangi transfer sababi"
          />
        </TabsContent>

        <TabsContent value="teacher-change" className="mt-4 space-y-4">
          <p className="text-sm text-muted-foreground">
            Guruhning ustozi almashtirilganda tanlanadi. Ketgan
            o&apos;quvchilar hisobotidagi ustoz o&apos;zgarishi tahlili shu
            sabablarga tayanadi.
          </p>
          <ReasonListManager
            endpoint="/group-teacher-change-reasons"
            queryKey="group-teacher-change-reasons"
            addPlaceholder="Yangi ustoz o'zgarishi sababi"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
