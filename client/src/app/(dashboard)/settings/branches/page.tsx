import { Suspense } from "react";
import { BranchesSettingsClient } from "@/components/settings/branches-settings-client";

export default function BranchesSettingsPage() {
  return (
    <Suspense>
      <BranchesSettingsClient />
    </Suspense>
  );
}
