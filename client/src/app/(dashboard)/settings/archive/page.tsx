import { Suspense } from "react";
import { ArchiveSettingsClient } from "@/components/settings/archive-settings-client";

export default function ArchiveSettingsPage() {
  return (
    <Suspense>
      <ArchiveSettingsClient />
    </Suspense>
  );
}
