import { notFound } from "next/navigation";
import { ReceiptView, type VerificationDto } from "./receipt-view";

async function fetchVerification(id: string): Promise<VerificationDto | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  // Try the auto-detect endpoint first — it figures out whether the id
  // points at a payment or refund.
  try {
    const res = await fetch(`${apiUrl}/receipts/${id}/verify`, {
      // Receipts are immutable post-allocation; cache aggressively.
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    return (await res.json()) as VerificationDto;
  } catch {
    return null;
  }
}

export default async function ReceiptVerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchVerification(id);
  if (!data) notFound();
  return <ReceiptView data={data} />;
}
