import { Suspense } from "react";
import { CenterActivityPage } from "@/components/reports/center-activity/center-activity-page";

export default function CenterActivityRoute() {
  return (
    <Suspense fallback={null}>
      <CenterActivityPage />
    </Suspense>
  );
}
