import { Suspense } from "react";
import { ExpensesPage } from "@/components/payments/expenses/expenses-page";

// «Xarajatlar» (spec B6). Old `?startDate=` / `?category=` links are ignored: the page opens the current month.
export default function ExpensesRoutePage() {
  return (
    <Suspense fallback={null}>
      <ExpensesPage />
    </Suspense>
  );
}
