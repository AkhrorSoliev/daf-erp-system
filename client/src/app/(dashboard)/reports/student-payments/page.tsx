import { Suspense } from "react";
import { StudentPaymentsClient } from "@/components/reports/student-payments/student-payments-client";

export default function StudentPaymentsPage() {
  return (
    <Suspense fallback={null}>
      <StudentPaymentsClient />
    </Suspense>
  );
}
