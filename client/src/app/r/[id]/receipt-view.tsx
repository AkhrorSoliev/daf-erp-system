"use client";

import { CheckCircle2, XCircle, FileText } from "lucide-react";
import { useT } from "@/i18n/use-t";
import { formatBalance } from "@/lib/format-utils";

/** What `GET /receipts/:id/verify` answers. Names, amounts, dates and the reason are data. */
export interface VerificationDto {
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

function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  // Tashkent (UTC+5)
  const local = new Date(d.getTime() + 5 * 60 * 60 * 1000);
  return `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)}.${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

// A client component only so the chrome follows the page language (the
// provider is in `app/r/layout.tsx`); the data was fetched on the server.
export function ReceiptView({ data }: { data: VerificationDto }) {
  const t = useT();
  const ok = !data.reversed;
  const code = data.receiptCode;
  const title =
    data.kind === "payment"
      ? t("Kvitansiya № {code}", { code })
      : t("Qaytarish hujjati № {code}", { code });

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
              {ok ? t("Bu hujjat haqiqiy") : t("Bu hujjat bekor qilingan")}
            </div>
            <div className="text-xs text-muted-foreground">
              {title}
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-3 text-sm">
        <Row label={t("Kompaniya")} value={data.companyName} />
        {data.branchName && <Row label={t("Filial")} value={data.branchName} />}
        <Row label={t("Summa")} value={formatBalance(data.amount, t("so'm"))} bold />
        <Row label={t("Sana")} value={formatDate(data.date)} />
        <Row label={t("O'quvchi")} value={`${data.studentName} (${data.studentId})`} />
        {data.groupName && <Row label={t("Guruh")} value={data.groupName} />}
        {data.receivedByName && (
          <Row
            label={data.kind === "payment" ? t("Qabul qildi") : t("Bajardi")}
            value={data.receivedByName}
          />
        )}
        {data.reversed && data.reversedReason && (
          <Row label={t("Bekor qilinish sababi")} value={data.reversedReason} />
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
          {t("PDF hujjatni yuklab olish")}
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
