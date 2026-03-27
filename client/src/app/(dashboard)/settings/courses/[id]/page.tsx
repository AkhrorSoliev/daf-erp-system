import { CourseDetailClient } from "@/components/settings/course-detail-client";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CourseDetailClient courseId={id} />;
}
