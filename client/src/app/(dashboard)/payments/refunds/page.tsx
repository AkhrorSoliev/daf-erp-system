import { Suspense } from "react";
import { RefundsPage } from "@/components/payments/refunds/refunds-page";

// Suspense: the page keeps its tab, chip, search and pages in the URL (`useSearchParams`).
export default function RefundsRoute() {
  return (
    <Suspense>
      <RefundsPage />
    </Suspense>
  );
}
