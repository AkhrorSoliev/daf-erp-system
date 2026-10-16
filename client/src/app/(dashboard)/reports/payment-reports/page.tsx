import { Suspense } from "react";
import { GroupPaymentsPage } from "@/components/reports/group-payments/group-payments-page";

// «Guruhlar bo'yicha to'lov» (spec B5); the address is the old «To'lov hisobotlari» one, so bookmarks keep working.
export default function PaymentReportsPage() {
  return (
    <Suspense fallback={null}>
      <GroupPaymentsPage />
    </Suspense>
  );
}
