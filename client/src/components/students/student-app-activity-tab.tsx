"use client";

import { usePeriodParam } from "@/components/groups/app-activity/activity-ui";
import { StudentActivityPanel } from "@/components/groups/app-activity/student-activity-panel";

/** O'quvchi profili → «Ilova» tabi: yon oynadagi panelning o'zi (dizayn 7). */
export function StudentAppActivityTab({ studentId }: { studentId: number }) {
  const [davr, setDavr] = usePeriodParam();
  return (
    <div className="max-w-3xl">
      <StudentActivityPanel
        url={`/students/${studentId}/app-activity`}
        davr={davr}
        onDavrChange={setDavr}
        renderHeader={null}
        bodyClassName=""
      />
    </div>
  );
}
