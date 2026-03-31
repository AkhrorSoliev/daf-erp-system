import { EmployeeProfileClient } from "@/components/settings/employee-profile-client";

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <EmployeeProfileClient employeeId={id} />;
}
