"use client";

import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { dmy, issuedDay } from "@/components/students/certificates/certificate-rules";
import { useT } from "@/i18n/use-t";
import type { VerifyDto } from "./load-verify";

// Client components only so the chrome follows the page language (the provider
// is in `app/t/layout.tsx`); the verdict was fetched on the server. Names,
// numbers and dates are data and are drawn as sent.
export function CertificateView({ data }: { data: VerifyDto }) {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-sm">
      <div
        className={`px-6 py-5 ${
          data.valid ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"
        }`}
      >
        <div className="flex items-center gap-3">
          {data.valid ? (
            <CheckCircle2 className="size-7 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="size-7 text-red-600 dark:text-red-400" />
          )}
          <div>
            <div className="text-base font-semibold">
              {data.valid ? t("Bu hujjat haqiqiy") : t("Bu hujjat bekor qilingan")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("Qatnashganlik hujjati № {number}", { number: data.number })}
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-6 text-sm">
        <Row label={t("Markaz")} value={data.companyName} />
        <Row label={t("O'quvchi")} value={data.studentName} bold />
        <Row label={t("Daraja")} value={data.level} />
        <Row label={t("Davr")} value={`${dmy(data.from)} – ${dmy(data.to)}`} />
        {/* The Tashkent day, as on the PDF: slicing the UTC instant is a day off from 00:00 to 05:00. */}
        <Row label={t("Berilgan sana")} value={issuedDay(data.issuedAt)} />
      </div>
    </div>
  );
}

export function CertificateUnavailable() {
  const t = useT();
  return (
    <div className="rounded-lg border bg-background p-6 text-center shadow-sm">
      <AlertCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {t("Hozir tekshirib bo'lmadi. Birozdan keyin qayta urinib ko'ring.")}
      </p>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right tabular-nums ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
