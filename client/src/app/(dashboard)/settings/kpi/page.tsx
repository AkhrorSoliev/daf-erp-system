import { Suspense } from "react";
import { KpiSettingsClient } from "@/components/settings/kpi-settings-client";

export default function KpiSettingsPage() {
  return (
    <Suspense>
      <KpiSettingsClient />
    </Suspense>
  );
}
