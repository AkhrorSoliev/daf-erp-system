import { Suspense } from "react";
import { OverviewPage } from "@/components/payments/overview/overview-page";

export default function PaymentsOverviewPage() {
  // The page reads its month from the URL (useSearchParams), which needs a
  // Suspense boundary to prerender.
  return (
    <Suspense fallback={null}>
      <OverviewPage />
    </Suspense>
  );
}
