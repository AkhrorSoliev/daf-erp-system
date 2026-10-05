import { Suspense } from "react";
import { redirect } from "next/navigation";
import { DebtPage } from "@/components/payments/debt/debt-page";
import { legacyDebtRedirect } from "@/components/payments/debt/debt-url";

// Old links (?tab=oylik, ?promise=overdue, …) still land (spec B2a §2.6).
// Suspense: the page keeps its tab and filters in the URL (`useSearchParams`).
export default async function DebtRoute({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const to = legacyDebtRedirect(await searchParams);
  if (to) redirect(to);
  return (
    <Suspense>
      <DebtPage />
    </Suspense>
  );
}
