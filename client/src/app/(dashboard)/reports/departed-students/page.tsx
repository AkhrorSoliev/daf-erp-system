import { Suspense } from "react";
import { DepartedStudentsPage } from "@/components/reports/departed-students/departed-students-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DepartedStudentsPage />
    </Suspense>
  );
}
