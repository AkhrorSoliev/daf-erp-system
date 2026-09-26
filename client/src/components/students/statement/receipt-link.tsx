import { FileText } from "lucide-react";

/** The PDF receipt of one payment, opened in a new tab. */
export function ReceiptLink({ paymentId }: { paymentId: string }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  return (
    <a
      href={`${apiUrl}/receipts/payment/${paymentId}.pdf`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
      title="PDF chek"
    >
      <FileText className="size-3.5" />
      Chek
    </a>
  );
}
