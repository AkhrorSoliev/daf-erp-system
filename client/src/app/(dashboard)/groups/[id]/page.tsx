import { GroupDetailClient } from "@/components/groups/group-detail-client";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <GroupDetailClient id={id} />;
}
