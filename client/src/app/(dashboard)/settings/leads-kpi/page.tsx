import { Suspense } from "react";
import { LeadsKpiSettingsClient } from "@/components/settings/leads-kpi-settings-client";

export default function LeadsKpiSettingsPage() {
  return (
    <Suspense>
      <LeadsKpiSettingsClient />
    </Suspense>
  );
}
