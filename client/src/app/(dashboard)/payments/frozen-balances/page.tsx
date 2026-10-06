import { Suspense } from "react";
import { DebtFiltersProvider } from "@/components/payments/debt/debt-filters-provider";
import { DebtSubpage } from "@/components/payments/debt/debt-subpage";
import { FrozenBalanceView } from "@/components/payments/debt/frozen-balance-view";

// Temporary (spec B2a §2.6): until part 2b replaces it with «Qaytariladigan pul».
export default function FrozenBalancesPage() {
  return (
    <Suspense>
      <DebtFiltersProvider>
        <DebtSubpage title="Muzlatilganlarning puli">
          <FrozenBalanceView />
        </DebtSubpage>
      </DebtFiltersProvider>
    </Suspense>
  );
}
