"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TodayAbsenteesTab } from "./today-absentees-tab";
import { RemovalQueueTab } from "./removal-queue-tab";
import { CallHistoryTab } from "./call-history-tab";
import { LogCallDialog, type LogCallPrefill } from "./log-call-dialog";
import { OutreachStatsWidget } from "./outreach-stats";
import { OverduePromisesBanner } from "./overdue-promises-banner";

const DEFAULT_TAB = "absentees";
const VALID_TABS = new Set(["absentees", "removals", "history"]);

export function OutreachPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabFromUrl = searchParams.get("tab") ?? DEFAULT_TAB;
  const activeTab = VALID_TABS.has(tabFromUrl) ? tabFromUrl : DEFAULT_TAB;

  const [callPrefill, setCallPrefill] = useState<LogCallPrefill | null>(null);

  const setActiveTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", tab);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  const openLogCall = useCallback((prefill: LogCallPrefill | null) => {
    setCallPrefill(prefill);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aloqa markazi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Darsga kelmaganlar va ko&apos;p dars qoldirganlar bilan ishlang —
          qo&apos;ng&apos;iroq qiling va natijasini qayd eting
        </p>
      </div>

      <OutreachStatsWidget />

      {/* Payment dates moved to /payments/debt, where the debt itself is. This
          is not a stub for it: the tab was a list, and what an admin needs here
          is the signal that some are overdue plus a way through. Leaving the
          list behind would have split the debt work across two pages. */}
      <OverduePromisesBanner />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="absentees">Bugungi kelmaganlar</TabsTrigger>
          <TabsTrigger value="removals">Ko&apos;p dars qoldirganlar</TabsTrigger>
          <TabsTrigger value="history">Qo&apos;ng&apos;iroq tarixi</TabsTrigger>
        </TabsList>

        {/* Pass `isActive` so each tab can defer its useQuery until activated.
         * Radix mounts all TabsContent children regardless of `value`, so the
         * `enabled` flag is the only way to actually skip the fetch. */}
        <TabsContent value="absentees" className="mt-4">
          <TodayAbsenteesTab
            isActive={activeTab === "absentees"}
            onLogCall={openLogCall}
          />
        </TabsContent>
        <TabsContent value="removals" className="mt-4">
          <RemovalQueueTab
            isActive={activeTab === "removals"}
            onLogCall={openLogCall}
          />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <CallHistoryTab isActive={activeTab === "history"} />
        </TabsContent>
      </Tabs>

      <LogCallDialog
        open={callPrefill !== null}
        onOpenChange={(open) => {
          if (!open) setCallPrefill(null);
        }}
        prefill={callPrefill}
      />
    </div>
  );
}
