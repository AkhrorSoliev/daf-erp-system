import { Suspense } from "react";
import { DebtPageClient } from "@/components/payments/debt/debt-page-client";

// Suspense is required, not decorative: the client reads `useSearchParams`
// (tab + filters live in the URL), which bails out of static prerendering
// without a boundary and fails `npm run build`.
export default function DebtPage() {
  return (
    <Suspense>
      <DebtPageClient />
    </Suspense>
  );
}
