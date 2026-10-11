"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/ui/month-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan, usePermissions } from "@/hooks/use-permissions";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { SalaryMonthlyView } from "./salary-monthly-view";
import { SalaryAdvancesTab } from "./salary-advances-tab";
import { SalaryAdvanceDialog } from "./salary-advance-dialog";
import { SalarySettingsSheet } from "./salary-settings-sheet";
import { CenterTopUpView } from "./debt/center-topup-view";
import { resolveSalarySettingsAccess } from "./salary-settings-access";
import { currentMonthKey } from "./salary-utils";
import { mln } from "./salary/salary-page-model";
import { SalaryPayDialog } from "./salary/salary-pay-dialog";
import { SalaryRowDrawer } from "./salary/salary-row-drawer";
import type { SalaryDetail } from "./salary/salary-types";
import { useInvalidateSalary, useSalaryMonthly, useSalaryTabTotals } from "./salary/salary-queries";

/** URL'ga yozilmaydigan standart tab. */
const DEFAULT_TAB = "oyliklar";

const FALLBACK_FLOOR = "2026-05";

/**
 * `month` is shared by all three tabs; `search` is the Oyliklar filter, read
 * here so the header's monthly query is the view's own (one request).
 * `xodim` is the user whose row drawer is open (0 = none), so a reload or a
 * shared link lands on the same person.
 */
const HEADER_SCHEMA = {
  month: { type: "string" as const, defaultValue: "" },
  search: { type: "string" as const, defaultValue: "" },
  xodim: { type: "number" as const, defaultValue: 0 },
};

/** «Avanslar · 4,5 mln»; the amount is left out while loading and at 0 (Decision 12). */
const tabLabel = (name: string, amount: number | undefined) => (amount ? `${name} · ${mln(amount)}` : name);

export function SalaryClient() {
  const canClose = useCan("salary.close");
  const canPay = useCan("salary.pay");
  // An advance is an expense: `POST/PATCH/DELETE /expenses` check `expenses.manage` (spec §2).
  const canAdvance = useCan("expenses.manage");
  const can = usePermissions((s) => s.can);
  const settingsAccess = resolveSalarySettingsAccess(can);
  const invalidateSalary = useInvalidateSalary();

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

  const { filters, setFilters } = useUrlFilters(HEADER_SCHEMA);
  const maxMonth = currentMonthKey();
  const month = filters.month || maxMonth;
  const { data: monthly } = useSalaryMonthly(month, filters.search);
  const tabTotals = useSalaryTabTotals(month);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  // The person the «Berildi» dialog (spec §5.1) is open for; it opens after the drawer closes.
  const [payTarget, setPayTarget] = useState<SalaryDetail | null>(null);
  const closeDrawer = () => setFilters({ xodim: 0 });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-heading text-lg font-semibold tracking-tight">Ish haqi</h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* «Markaz qoplagani» has its own picker, where an empty month means the whole period. */}
          {activeTab !== "markaz" && (
            <MonthPicker
              value={monthly?.month ?? month}
              minMonth={monthly?.floorMonth ?? FALLBACK_FLOOR}
              maxMonth={maxMonth}
              onChange={(m) => setFilters({ month: m })}
              className="w-full sm:w-52"
            />
          )}
          {settingsAccess.canOpen && (
            <Button variant="outline" data-tour="salary-settings" onClick={() => setSettingsOpen(true)}>
              <Settings2 data-icon="inline-start" />
              Stavkalar
            </Button>
          )}
          {canAdvance && (
            <Button onClick={() => setAdvanceOpen(true)}>
              <Plus data-icon="inline-start" />
              Avans berish
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col gap-4">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="oyliklar">Oyliklar</TabsTrigger>
          <TabsTrigger value="avanslar">{tabLabel("Avanslar", tabTotals.advances)}</TabsTrigger>
          <TabsTrigger value="markaz">{tabLabel("Markaz qoplagani", tabTotals.centerOutstanding)}</TabsTrigger>
        </TabsList>

        <TabsContent value="oyliklar">
          <SalaryMonthlyView
            month={month}
            onOpenRow={(userId) => setFilters({ xodim: userId })}
            canClose={canClose}
            settingsAccess={settingsAccess}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </TabsContent>

        <TabsContent value="avanslar">
          {/* The tab keeps a picked day and a table page; a new month starts them over. */}
          <SalaryAdvancesTab key={month} canPay={canAdvance} />
        </TabsContent>

        <TabsContent value="markaz">
          <CenterTopUpView />
        </TabsContent>
      </Tabs>

      {/* Rates — CEO sees everything; a director only their own branch's teacher rates (ADR-0034) */}
      {settingsAccess.canOpen && (
        <SalarySettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          period={monthly?.period ?? null}
          onChanged={invalidateSalary}
          access={settingsAccess}
        />
      )}

      {canAdvance && <SalaryAdvanceDialog open={advanceOpen} onOpenChange={setAdvanceOpen} onSaved={invalidateSalary} />}

      <SalaryRowDrawer
        userId={filters.xodim || null}
        month={month}
        state={monthly?.monthState.kind}
        onClose={closeDrawer}
        onPay={setPayTarget}
        canClose={canClose}
        canPay={canPay}
      />

      <SalaryPayDialog
        detail={payTarget}
        onClose={() => setPayTarget(null)}
        onPaid={() => {
          // Back to the same person's drawer, now showing the payout.
          if (payTarget) setFilters({ xodim: payTarget.row.user.id });
          setPayTarget(null);
        }}
      />
    </div>
  );
}
