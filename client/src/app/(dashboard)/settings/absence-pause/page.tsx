import { Suspense } from "react";
import { AbsencePauseSettingsClient } from "@/components/settings/absence-pause-settings-client";

export default function AbsencePauseSettingsPage() {
  return (
    <Suspense>
      <AbsencePauseSettingsClient />
    </Suspense>
  );
}
