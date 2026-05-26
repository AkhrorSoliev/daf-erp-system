import { Suspense } from "react";
import { MockExamsClient } from "@/components/mock-exams/mock-exams-client";

export default function MockExamsPage() {
  return (
    <Suspense>
      <MockExamsClient />
    </Suspense>
  );
}
