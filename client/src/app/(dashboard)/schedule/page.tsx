import { Suspense } from "react";
import { ScheduleClient } from "@/components/dashboard/schedule-client";

export default function SchedulePage() {
  return (
    <Suspense>
      <ScheduleClient />
    </Suspense>
  );
}
