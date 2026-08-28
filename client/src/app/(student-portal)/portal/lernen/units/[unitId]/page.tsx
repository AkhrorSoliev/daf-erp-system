import { LernenUnitPage } from "@/components/student-portal/lernen/lernen-unit-page";

export default async function Page({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  return <LernenUnitPage unitId={Number(unitId)} />;
}
