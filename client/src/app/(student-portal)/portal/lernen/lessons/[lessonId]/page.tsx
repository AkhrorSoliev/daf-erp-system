import { LernenLessonPage } from "@/components/student-portal/lernen/lernen-lesson-page";

export default async function Page({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LernenLessonPage lessonId={Number(lessonId)} />;
}
