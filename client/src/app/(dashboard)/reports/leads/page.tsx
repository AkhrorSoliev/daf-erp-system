import { Suspense } from "react";
import { LeadFunnelClient } from "@/components/reports/lead-funnel/lead-funnel-client";

export default function LeadsReportsPage() {
  return (
    <Suspense fallback={null}>
      <LeadFunnelClient />
    </Suspense>
  );
}
