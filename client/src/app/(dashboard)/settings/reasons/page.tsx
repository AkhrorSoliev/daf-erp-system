import { Suspense } from "react";
import { ReasonsSettingsClient } from "@/components/settings/reasons-settings-client";

export default function ReasonsSettingsPage() {
  return (
    <Suspense>
      <ReasonsSettingsClient />
    </Suspense>
  );
}
