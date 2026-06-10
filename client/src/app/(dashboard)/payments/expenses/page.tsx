import { Suspense } from "react";
import { ExpensesClient } from "@/components/payments/expenses-client";

export default function ExpensesPage() {
  return (
    <Suspense>
      <ExpensesClient />
    </Suspense>
  );
}
