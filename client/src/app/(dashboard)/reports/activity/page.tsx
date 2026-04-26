import { Suspense } from "react";
import { CenterActivityClient } from "@/components/reports/center-activity/center-activity-client";

export default function CenterActivityPage() {
  return (
    <Suspense fallback={null}>
      <CenterActivityClient />
    </Suspense>
  );
}
