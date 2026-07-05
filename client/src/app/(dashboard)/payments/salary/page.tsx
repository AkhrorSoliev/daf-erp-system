import { Suspense } from "react";
import { SalaryClient } from "@/components/payments/salary-client";

export default function SalaryPage() {
  return (
    <Suspense>
      <SalaryClient />
    </Suspense>
  );
}
