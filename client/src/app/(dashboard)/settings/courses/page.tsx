import { Suspense } from "react";
import { CoursesSettingsClient } from "@/components/settings/courses-settings-client";

export default function CoursesSettingsPage() {
  return (
    <Suspense>
      <CoursesSettingsClient />
    </Suspense>
  );
}
