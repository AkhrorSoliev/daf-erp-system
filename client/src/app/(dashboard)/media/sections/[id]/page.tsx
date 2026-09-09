import { SectionDetailClient } from "@/components/media/section-detail-client";

export default async function MediaSectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <SectionDetailClient sectionId={Number(id)} />;
}
