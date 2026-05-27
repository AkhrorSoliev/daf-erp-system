"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TodayAbsenteesTab } from "./today-absentees-tab";
import { CallbacksTab } from "./callbacks-tab";
import { RemovalQueueTab } from "./removal-queue-tab";
import { AddCallbackDialog, type AddCallbackPrefill } from "./add-callback-dialog";

const DEFAULT_TAB = "absentees";
const VALID_TABS = new Set(["absentees", "callbacks", "removals"]);

export function OutreachPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabFromUrl = searchParams.get("tab") ?? DEFAULT_TAB;
  const activeTab = VALID_TABS.has(tabFromUrl) ? tabFromUrl : DEFAULT_TAB;

  const [callbackPrefill, setCallbackPrefill] = useState<AddCallbackPrefill | null>(null);

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

  const openAddCallback = useCallback((prefill: AddCallbackPrefill | null) => {
    setCallbackPrefill(prefill);
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Aloqa markazi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Darsga kelmagan o&apos;quvchilar, qo&apos;ng&apos;iroq vazifalari va guruhdan chiqarish navbati
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="absentees">Bugungi kelmaganlar</TabsTrigger>
          <TabsTrigger value="callbacks">Qo&apos;ng&apos;iroqlar</TabsTrigger>
          <TabsTrigger value="removals">Chiqarish navbati</TabsTrigger>
        </TabsList>

        <TabsContent value="absentees" className="mt-4">
          <TodayAbsenteesTab onAddCallback={openAddCallback} />
        </TabsContent>
        <TabsContent value="callbacks" className="mt-4">
          <CallbacksTab />
        </TabsContent>
        <TabsContent value="removals" className="mt-4">
          <RemovalQueueTab onAddCallback={openAddCallback} />
        </TabsContent>
      </Tabs>

      <AddCallbackDialog
        open={callbackPrefill !== null}
        onOpenChange={(open) => {
          if (!open) setCallbackPrefill(null);
        }}
        prefill={callbackPrefill}
      />
    </div>
  );
}
