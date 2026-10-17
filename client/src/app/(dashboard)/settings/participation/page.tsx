import { Suspense } from "react";
import { ParticipationSettingsClient } from "@/components/settings/participation-settings-client";

export default function ParticipationSettingsPage() {
  return (
    <Suspense>
      <ParticipationSettingsClient />
    </Suspense>
  );
}
