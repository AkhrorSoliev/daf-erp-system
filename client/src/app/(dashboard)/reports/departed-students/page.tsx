import { Suspense } from "react";
import { DepartedStudentsClient } from "@/components/reports/departed-students/departed-students-client";

export default function DepartedStudentsPage() {
  return (
    <Suspense fallback={null}>
      <DepartedStudentsClient />
    </Suspense>
  );
}
