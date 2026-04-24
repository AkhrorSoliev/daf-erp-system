import { Suspense } from "react";
import { PaymentReportsClient } from "@/components/reports/payment-reports/payment-reports-client";

export default function PaymentReportsPage() {
  return (
    <Suspense fallback={null}>
      <PaymentReportsClient />
    </Suspense>
  );
}
