import { Suspense } from "react";
import { PaymentsListPage } from "@/components/payments/list/payments-list-page";

// Suspense: the filters live in the URL (`useSearchParams`).
export default function PaymentsListRoute() {
  return (
    <Suspense fallback={null}>
      <PaymentsListPage />
    </Suspense>
  );
}
