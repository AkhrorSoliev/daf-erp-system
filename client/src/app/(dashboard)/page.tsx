import { Suspense } from "react";
import { DashboardClient } from "@/components/dashboard-client";

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardClient />
    </Suspense>
  );
}
