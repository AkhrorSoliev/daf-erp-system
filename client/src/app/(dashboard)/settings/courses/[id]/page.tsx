import { notFound } from "next/navigation";
import { courses } from "@/data/courses-model";
import { CourseDetailClient } from "@/components/settings/course-detail-client";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = courses.find((c) => c.id === id);

  if (!course) {
    notFound();
  }

  return <CourseDetailClient course={course} />;
}
