"use client";

import Link from "next/link";
import { format } from "date-fns";
import { FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format-utils";
import type { ExamDetail } from "./exam-detail-types";

interface ExamOverviewTabProps {
  exam: ExamDetail;
  // onShare reserved for future use (currently the share dialog is in the header toolbar).
  onShare?: () => void;
}

export function ExamOverviewTab({ exam }: ExamOverviewTabProps) {
  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
      <div className="md:col-span-2 rounded-lg border bg-card">
        <dl className="divide-y text-sm">
          <Row
            label="Imtihon sanasi"
            value={
              exam.examDate
                ? format(new Date(exam.examDate), "dd.MM.yyyy")
                : "—"
            }
          />
          <Row
            label="Imtihon vaqtlari"
            value={
              exam.examTimes && exam.examTimes.length > 0 ? (
                <span className="flex flex-wrap justify-end gap-1">
                  {exam.examTimes.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums"
                    >
                      🕐 {t}
                    </span>
                  ))}
                </span>
              ) : exam.examDate ? (
                format(new Date(exam.examDate), "HH:mm")
              ) : (
                "—"
              )
            }
          />
          <Row
            label="Ro'yxat yopiladi"
            value={
              exam.registrationDeadline
                ? format(
                    new Date(exam.registrationDeadline),
                    "dd.MM.yyyy, HH:mm",
                  )
                : "—"
            }
          />
          <Row
            label="Narxi"
            value={
              exam.price > 0 ? `${formatPrice(exam.price)} so'm` : "Bepul"
            }
          />
          <Row
            label="DaF o'quvchi narxi"
            value={
              exam.studentPrice != null
                ? exam.studentPrice > 0
                  ? `${formatPrice(exam.studentPrice)} so'm`
                  : "Bepul"
                : "— (to'liq narx)"
            }
          />
          <Row
            label="Taklif etilgan darajalar"
            value={
              exam.offeredLevels && exam.offeredLevels.length > 0 ? (
                <span className="flex flex-wrap justify-end gap-1">
                  {exam.offeredLevels.map((lvl) => (
                    <span
                      key={lvl}
                      className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                    >
                      {lvl}
                    </span>
                  ))}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Row
            label="Ishtirokchilar"
            value={`${exam.participantCount} kishi`}
          />
          <Row
            label="Yaratilgan"
            value={format(new Date(exam.createdAt), "dd.MM.yyyy, HH:mm")}
          />
        </dl>
      </div>

      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-sm font-semibold">Ro&apos;yxatga olish formasi</h2>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Telegram bot orqali ishtirokchilardan so&apos;raladigan savollar. Ism,
          familya va telefon majburiy.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-4 w-full">
          <Link href={`/mock-exams/${exam.id}/form`}>
            <FileEdit className="size-4" />
            Forma sozlash
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}
