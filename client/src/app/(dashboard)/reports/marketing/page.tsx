import { Suspense } from "react";
import { MarketingClient } from "@/components/reports/marketing/marketing-client";

export default function MarketingReportPage() {
  // The month lives in the URL (useSearchParams): prerendering needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <MarketingClient />
    </Suspense>
  );
}
