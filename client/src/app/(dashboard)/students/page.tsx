import { Suspense } from "react";
import { StudentsClient } from "@/components/students/students-client";

export default function StudentsPage() {
  return (
    <div className="space-y-6">
      <Suspense>
        <StudentsClient />
      </Suspense>
    </div>
  );
}
