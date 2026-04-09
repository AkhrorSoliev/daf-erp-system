import { Suspense } from "react";
import { EmployeesSettingsClient } from "@/components/settings/employees-settings-client";

export default function EmployeesSettingsPage() {
  return (
    <Suspense>
      <EmployeesSettingsClient />
    </Suspense>
  );
}
