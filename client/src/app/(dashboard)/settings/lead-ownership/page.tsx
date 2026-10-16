import { Suspense } from "react";
import { LeadOwnershipSettingsClient } from "@/components/settings/lead-ownership-settings-client";

export default function LeadOwnershipSettingsPage() {
  return (
    <Suspense>
      <LeadOwnershipSettingsClient />
    </Suspense>
  );
}
