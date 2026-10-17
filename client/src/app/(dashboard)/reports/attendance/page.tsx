import { Suspense } from "react";
import { AttendancePage } from "@/components/reports/attendance/attendance-page";

export default function AttendanceReportPage() {
  return (
    <Suspense fallback={null}>
      <AttendancePage />
    </Suspense>
  );
}
