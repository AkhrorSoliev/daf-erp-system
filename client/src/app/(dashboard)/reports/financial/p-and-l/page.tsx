import { Suspense } from "react";
import { ProfitLossClient } from "@/components/reports/financial/profit-loss-client";

export default function ProfitLossPage() {
  return (
    <Suspense fallback={null}>
      <ProfitLossClient />
    </Suspense>
  );
}
