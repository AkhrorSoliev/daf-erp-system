import { Suspense } from "react";
import { HolidaysSettingsClient } from "@/components/settings/holidays-settings-client";

export default function HolidaysSettingsPage() {
  return (
    <Suspense>
      <HolidaysSettingsClient />
    </Suspense>
  );
}
