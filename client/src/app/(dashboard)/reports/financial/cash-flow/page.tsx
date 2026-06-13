import { Suspense } from "react";
import { CashFlowClient } from "@/components/reports/financial/cash-flow-client";

export default function CashFlowPage() {
  return (
    <Suspense fallback={null}>
      <CashFlowClient />
    </Suspense>
  );
}
