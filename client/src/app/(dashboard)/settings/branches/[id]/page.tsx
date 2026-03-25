import { BranchDetailClient } from "@/components/settings/branch-detail-client";

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BranchDetailClient branchId={id} />;
}
