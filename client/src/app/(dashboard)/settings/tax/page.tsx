import { Suspense } from "react";
import { TaxSettingsClient } from "@/components/settings/tax-settings-client";

export default function TaxSettingsPage() {
  return (
    <Suspense>
      <TaxSettingsClient />
    </Suspense>
  );
}
