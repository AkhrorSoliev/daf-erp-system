import { Suspense } from "react";
import { RulesSettingsClient } from "@/components/settings/rules-settings-client";

export default function RulesSettingsPage() {
  return (
    <Suspense>
      <RulesSettingsClient />
    </Suspense>
  );
}
