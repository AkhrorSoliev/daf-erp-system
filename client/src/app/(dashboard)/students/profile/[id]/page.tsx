import { StudentProfileClient } from "@/components/students/student-profile-client";

export default async function StudentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <StudentProfileClient studentId={id} />;
}
