import { Suspense } from "react";
import { TasksPageClient } from "@/components/tasks/tasks-page-client";

export default function TasksPage() {
  return (
    <Suspense>
      <TasksPageClient />
    </Suspense>
  );
}
