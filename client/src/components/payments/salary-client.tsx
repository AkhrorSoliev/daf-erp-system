"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan, usePermissions } from "@/hooks/use-permissions";
import { SalaryBreakdownDrawer } from "./salary-breakdown-drawer";
import { SalaryMonthlyView } from "./salary-monthly-view";
import { SalaryAdvancesTab } from "./salary-advances-tab";
import { CenterTopUpView } from "./debt/center-topup-view";
import { resolveSalarySettingsAccess } from "./salary-settings-access";

/** URL'ga yozilmaydigan standart tab. */
const DEFAULT_TAB = "oyliklar";

export function SalaryClient() {
  const canClose = useCan("salary.close");
  const canPay = useCan("salary.pay");
  const can = usePermissions((s) => s.can);
  const settingsAccess = resolveSalarySettingsAccess(can);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? DEFAULT_TAB;

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", tab);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [breakdownPaymentId, setBreakdownPaymentId] = useState<string | null>(
    null,
  );

  return (
    <div className="space-y-6">
      <div>
        {/* Sahifa sarlavhasi "Ish haqi" — tab nomlari ("Oyliklar" / "Avanslar")
            bilan takrorlanmasin. Sahifa ustozlarni ham, oylik xodimlarni ham
            qamraydi. */}
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Ish haqi
        </h2>
        <p className="text-sm text-muted-foreground">
          Tanlangan oyda kimga qancha to&apos;lanishi va qaysi kuni qancha avans
          berilgani
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="oyliklar">Oyliklar</TabsTrigger>
          <TabsTrigger value="avanslar">Avanslar</TabsTrigger>
          <TabsTrigger value="markaz">Markaz qoplagani</TabsTrigger>
        </TabsList>

        <TabsContent value="oyliklar">
          <SalaryMonthlyView
            canClose={canClose}
            canPay={canPay}
            settingsAccess={settingsAccess}
            onOpenBreakdown={setBreakdownPaymentId}
            refreshKey={refreshKey}
            bumpRefresh={bumpRefresh}
          />
        </TabsContent>

        <TabsContent value="avanslar">
          <SalaryAdvancesTab canPay={canPay} />
        </TabsContent>

        <TabsContent value="markaz">
          <CenterTopUpView />
        </TabsContent>
      </Tabs>

      <SalaryBreakdownDrawer
        salaryPaymentId={breakdownPaymentId}
        onClose={() => setBreakdownPaymentId(null)}
        canClose={canClose}
        canPay={canPay}
        onChanged={bumpRefresh}
      />
    </div>
  );
}
