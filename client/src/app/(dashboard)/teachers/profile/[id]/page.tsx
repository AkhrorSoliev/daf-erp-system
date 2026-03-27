import { TeacherProfileClient } from "@/components/teachers/teacher-profile-client";

export default async function TeacherProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <TeacherProfileClient teacherId={id} />;
}
