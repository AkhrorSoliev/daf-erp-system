"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { SalaryBreakdownDrawer } from "./salary-breakdown-drawer";
import { SalaryMonthlyView } from "./salary-monthly-view";
import { SalaryAdvancesTab } from "./salary-advances-tab";

/** URL'ga yozilmaydigan standart tab. */
const DEFAULT_TAB = "oyliklar";

export function SalaryClient() {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const canPay = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;

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
        </TabsList>

        <TabsContent value="oyliklar">
          <SalaryMonthlyView
            isCeo={isCeo}
            canPay={canPay}
            onOpenBreakdown={setBreakdownPaymentId}
            refreshKey={refreshKey}
            bumpRefresh={bumpRefresh}
          />
        </TabsContent>

        <TabsContent value="avanslar">
          <SalaryAdvancesTab canPay={canPay} />
        </TabsContent>
      </Tabs>

      <SalaryBreakdownDrawer
        salaryPaymentId={breakdownPaymentId}
        onClose={() => setBreakdownPaymentId(null)}
        isCeo={isCeo}
        canPay={canPay}
        onChanged={bumpRefresh}
      />
    </div>
  );
}
