import { Suspense } from "react";
import { BalanceSheetClient } from "@/components/reports/financial/balance-sheet-client";

export default function BalanceSheetPage() {
  return (
    <Suspense fallback={null}>
      <BalanceSheetClient />
    </Suspense>
  );
}
