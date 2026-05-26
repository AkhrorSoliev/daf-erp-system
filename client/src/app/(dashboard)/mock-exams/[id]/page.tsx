import { ExamDetailClient } from "@/components/mock-exams/exam-detail-client";

export default async function MockExamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamDetailClient examId={id} />;
}
