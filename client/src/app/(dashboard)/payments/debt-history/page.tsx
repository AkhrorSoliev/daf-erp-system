import { Suspense } from "react";
import { DebtHistoryView } from "@/components/payments/debt-history/debt-history-view";

export default function DebtHistoryPage() {
  return (
    <Suspense>
      <DebtHistoryView />
    </Suspense>
  );
}
