"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DebtFiltersProvider, useDebtFilters } from "./debt-filters-provider";
import { DebtorsView } from "./debtors-view";
import { CenterTopUpView } from "./center-topup-view";
import { DynamicsView } from "./dynamics-view";
import { WriteOffsView } from "./write-offs-view";

/**
 * One page for everything to do with money owed to the center.
 *
 * Debt used to live in five places — a debtor list, a monthly roll-forward, a
 * write-off archive, a promises tab inside the call centre, and a dialog on the
 * salary page. Answering one question meant walking between them, and no screen
 * could say everything about one student.
 *
 * The tabs here are not those five surfaces relocated. Payment promises and
 * "longest-standing debtors" are not views at all — a promise is a property of
 * a debtor (the list endpoint already returns it) and "longest-standing" is a
 * sort. What remains are genuinely different questions: who owes now, and what
 * the center has fronted for them this month. The monthly dynamics and the
 * write-off archive follow in later phases.
 */
const TABS = [
  { value: "qarzdorlar", label: "Qarzdorlar" },
  { value: "markaz", label: "Markaz qoplagani" },
  { value: "dinamika", label: "Dinamika" },
  { value: "kechirilgan", label: "Kechirilganlar" },
] as const;

export function DebtPageClient() {
  return (
    <DebtFiltersProvider>
      <DebtPageTabs />
    </DebtFiltersProvider>
  );
}

function DebtPageTabs() {
  const { filters, setFilters } = useDebtFilters();
  const active = TABS.some((t) => t.value === filters.tab)
    ? filters.tab
    : TABS[0].value;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-lg font-semibold tracking-tight">
          Qarzdorlik
        </h1>
        <p className="text-sm text-muted-foreground">
          Kim qarzdor, qancha va nima qilingan — hammasi shu yerda
        </p>
      </div>

      <Tabs
        value={active}
        onValueChange={(tab) =>
          // Switching view resets pagination: page 4 of the debtor list means
          // nothing in another tab, and carrying it over shows an empty table.
          setFilters({ tab, page: 1 })
        }
      >
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="qarzdorlar" className="mt-6">
          <DebtorsView />
        </TabsContent>
        <TabsContent value="markaz" className="mt-6">
          <CenterTopUpView />
        </TabsContent>
        <TabsContent value="dinamika" className="mt-6">
          <DynamicsView />
        </TabsContent>
        <TabsContent value="kechirilgan" className="mt-6">
          <WriteOffsView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
