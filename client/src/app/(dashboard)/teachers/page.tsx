import { Suspense } from "react";
import { TeachersClient } from "@/components/teachers/teachers-client";
import { TeachersHeading } from "@/components/teachers/teachers-heading";

export default function TeachersPage() {
  return (
    <div className="space-y-6">
      <TeachersHeading />
      <Suspense>
        <TeachersClient />
      </Suspense>
    </div>
  );
}
