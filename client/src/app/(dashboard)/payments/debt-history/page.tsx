import { Suspense } from "react";
import { DebtFiltersProvider } from "@/components/payments/debt/debt-filters-provider";
import { DebtSubpage } from "@/components/payments/debt/debt-subpage";
import { MonthlyDebtView } from "@/components/payments/debt/monthly-debt-view";

// A real page again (spec B2a §2.6). Suspense: the view keeps its status filter in the URL.
export default function DebtHistoryPage() {
  return (
    <Suspense>
      <DebtFiltersProvider>
        <DebtSubpage title="Oylar bo'yicha qarz tarixi">
          <MonthlyDebtView />
        </DebtSubpage>
      </DebtFiltersProvider>
    </Suspense>
  );
}
