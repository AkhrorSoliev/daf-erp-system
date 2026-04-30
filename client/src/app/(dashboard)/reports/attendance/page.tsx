import { Suspense } from "react";
import { AttendanceSection } from "@/components/reports/attendance/attendance-section";

export default function AttendancePage() {
  return (
    <Suspense fallback={null}>
      <AttendanceSection />
    </Suspense>
  );
}
