import { Suspense } from "react";
import { KpiOverviewPage } from "@/components/reports/admin-kpi/kpi-overview-page";

export default function AdminKpiPage() {
  // The month, the compare month and the open person live in the URL (useSearchParams).
  return (
    <Suspense fallback={null}>
      <KpiOverviewPage />
    </Suspense>
  );
}
