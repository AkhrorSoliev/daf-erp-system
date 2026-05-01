import { Suspense } from "react";
import { SalaryConfigPageClient } from "@/components/payments/salary-config-page-client";

export default function SalaryConfigPage() {
  return (
    <Suspense>
      <SalaryConfigPageClient />
    </Suspense>
  );
}
