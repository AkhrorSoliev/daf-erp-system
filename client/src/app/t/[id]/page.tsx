import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { dmy, issuedDay } from "@/components/students/certificates/certificate-rules";
import { loadVerify } from "./load-verify";

// A JS string, not JSX text: an apostrophe entity plus a line break loses a space (SWC bug, Next 16.2).
const UNAVAILABLE = "Hozir tekshirib bo'lmadi. Birozdan keyin qayta urinib ko'ring.";

export default async function CertificateVerifyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadVerify(id);
  if (result.kind === "not-found") notFound();
  // No verdict at all: a busy or failing server must not make a genuine document read as fake.
  if (result.kind === "unavailable") return <Unavailable />;
  const data = result.data;

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
              {data.valid ? "Bu hujjat haqiqiy" : "Bu hujjat bekor qilingan"}
            </div>
            <div className="text-xs text-muted-foreground">Teilnahmebestätigung № {data.number}</div>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-6 text-sm">
        <Row label="Markaz" value={data.companyName} />
        <Row label="O'quvchi" value={data.studentName} bold />
        <Row label="Daraja" value={data.level} />
        <Row label="Davr" value={`${dmy(data.from)} – ${dmy(data.to)}`} />
        {/* The Tashkent day, as on the PDF: slicing the UTC instant is a day off from 00:00 to 05:00. */}
        <Row label="Berilgan sana" value={issuedDay(data.issuedAt)} />
      </div>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="rounded-lg border bg-background p-6 text-center shadow-sm">
      <AlertCircle className="mx-auto mb-3 size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{UNAVAILABLE}</p>
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
