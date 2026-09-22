import { Suspense } from "react";
import { PaymentSettingsClient } from "@/components/settings/payment-settings-client";

export default function PaymentSettingsPage() {
  return (
    <Suspense>
      <PaymentSettingsClient />
    </Suspense>
  );
}
