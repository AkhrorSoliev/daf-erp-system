import { Suspense } from "react";
import { LessonRatingsClient } from "@/components/reports/lesson-ratings/lesson-ratings-client";

export default function LessonRatingsPage() {
  // The month and the open teacher live in the URL (useSearchParams).
  return (
    <Suspense fallback={null}>
      <LessonRatingsClient />
    </Suspense>
  );
}
