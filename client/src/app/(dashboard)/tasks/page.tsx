import { Suspense } from "react";
import { TasksBoardClient } from "@/components/tasks/tasks-board-client";

export default function TasksPage() {
  return (
    <Suspense>
      <TasksBoardClient />
    </Suspense>
  );
}
