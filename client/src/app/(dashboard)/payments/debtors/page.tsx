import { Suspense } from "react";
import { DebtorsClient } from "@/components/payments/debtors-client";

export default function DebtorsPage() {
  return (
    <Suspense>
      <DebtorsClient />
    </Suspense>
  );
}
