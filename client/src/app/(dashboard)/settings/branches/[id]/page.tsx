import { notFound } from "next/navigation";
import { BranchDetailClient } from "@/components/settings/branch-detail-client";

const mockBranches = [
  { id: "1", name: "Asosiy filial", address: "Toshkent sh., Chilonzor t., 1-kvartal", phone: "901234567", status: "active" as const },
  { id: "2", name: "2-filial", address: "Toshkent sh., Yunusobod t., 5-kvartal", phone: "912345678", status: "active" as const },
  { id: "3", name: "3-filial", address: "Toshkent sh., Mirzo Ulug'bek t., 3-kvartal", phone: "933456789", status: "inactive" as const },
];

export default async function BranchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const branch = mockBranches.find((b) => b.id === id);

  if (!branch) {
    notFound();
  }

  return <BranchDetailClient branch={branch} />;
}
