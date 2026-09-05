import { SeansEkrani } from "@/components/student-portal/lernen/uebung/seans-ekrani";

export default async function Page({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <SeansEkrani lessonId={Number(lessonId)} />;
}
