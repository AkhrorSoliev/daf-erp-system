import { CheckCircle2, XCircle, FileText } from "lucide-react";
import { notFound } from "next/navigation";

interface VerificationDto {
  kind: "payment" | "refund";
  receiptCode: string;
  reversed: boolean;
  reversedReason: string | null;
  amount: number;
  currency: "UZS";
  date: string;
  studentName: string;
  studentId: number;
  groupName: string | null;
  branchName: string | null;
  companyName: string;
  receivedByName: string | null;
  pdfUrl: string;
}

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

function formatSom(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Tashkent (UTC+5)
  const t = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

export default async function ReceiptVerifyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await fetchVerification(id);
  if (!data) notFound();

  const ok = !data.reversed;
  const title = data.kind === "payment" ? "Kvitansiya" : "Qaytarish hujjati";

  return (
    <div className="rounded-lg border bg-background shadow-sm overflow-hidden">
      <div
        className={`px-6 py-5 ${
          ok
            ? "bg-emerald-50 dark:bg-emerald-950/30"
            : "bg-red-50 dark:bg-red-950/30"
        }`}
      >
        <div className="flex items-center gap-3">
          {ok ? (
            <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="size-7 text-red-600 dark:text-red-400" />
          )}
          <div>
            <div className="text-base font-semibold">
              {ok ? "Bu hujjat haqiqiy" : "Bu hujjat bekor qilingan"}
            </div>
            <div className="text-xs text-muted-foreground">
              {title} № {data.receiptCode}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-3 text-sm">
        <Row label="Kompaniya" value={data.companyName} />
        {data.branchName && <Row label="Filial" value={data.branchName} />}
        <Row
          label="Summa"
          value={`${formatSom(data.amount)} so'm`}
          bold
        />
        <Row label="Sana" value={formatDate(data.date)} />
        <Row label="O'quvchi" value={`${data.studentName} (${data.studentId})`} />
        {data.groupName && <Row label="Guruh" value={data.groupName} />}
        {data.receivedByName && (
          <Row
            label={data.kind === "payment" ? "Qabul qildi" : "Bajardi"}
            value={data.receivedByName}
          />
        )}
        {data.reversed && data.reversedReason && (
          <Row label="Bekor qilish sababi" value={data.reversedReason} />
        )}
      </div>

      <div className="border-t px-6 py-4 bg-muted/40">
        <a
          href={data.pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <FileText className="size-4" />
          PDF hujjatni yuklab olish
        </a>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`text-right ${bold ? "font-semibold tabular-nums" : "tabular-nums"}`}
      >
        {value}
      </span>
    </div>
  );
}
