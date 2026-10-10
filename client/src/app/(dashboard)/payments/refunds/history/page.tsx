import { Suspense } from "react";
import { RefundHistoryPage } from "@/components/payments/refunds/refund-history-page";

// Suspense: the page keeps its page and page size in the URL (`useSearchParams`).
export default function RefundHistoryRoute() {
  return (
    <Suspense>
      <RefundHistoryPage />
    </Suspense>
  );
}
