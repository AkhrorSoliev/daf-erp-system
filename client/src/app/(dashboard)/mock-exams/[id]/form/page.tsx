import { ExamFormBuilderClient } from "@/components/mock-exams/exam-form-builder-client";

export default async function MockExamFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExamFormBuilderClient examId={id} />;
}
