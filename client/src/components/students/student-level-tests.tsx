"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";

export interface LevelTestAttempt {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "RUNNING" | "ABANDONED" | "COMPLETED" | "STOPPED" | "TIMED_OUT" | "CANCELLED";
  result: string | null;
  answered: number;
  correct: number;
  total: number;
}

interface StudentLevelTestsData {
  latest: LevelTestAttempt | null;
  attempts: LevelTestAttempt[];
}

const RESULT_TEXT: Record<string, string> = {
  BEGINNER: msg("Boshlang'ich (A1 dan past)"),
  A1: msg("A1"),
  A2: msg("A2"),
  B1: msg("B1"),
  B2: msg("B2"),
  UNKNOWN: msg("Aniqlanmadi"),
};

const STATUS_TEXT: Record<LevelTestAttempt["status"], string> = {
  RUNNING: msg("Yechilmoqda"),
  ABANDONED: msg("Yarmida qoldi"),
  COMPLETED: msg("Oxirigacha yechdi"),
  STOPPED: msg("O'zi to'xtatdi"),
  TIMED_OUT: msg("Vaqt tugadi"),
  CANCELLED: msg("Bekor qildi"),
};

/** «Daraja testi» (ADR-0122): o'quvchining botdagi test natijalari. Server hisoblaydi, mijoz faqat chizadi. */
export function StudentLevelTests({ studentId }: { studentId: number }) {
  const t = useT();
  const resultLabel = (code: string | null): string => {
    const text = RESULT_TEXT[code ?? ""] ?? RESULT_TEXT.UNKNOWN;
    return t(text);
  };
  const statusLabel = (s: LevelTestAttempt["status"]): string => {
    const text = STATUS_TEXT[s];
    return t(text);
  };
  const { data, isLoading, isError } = useQuery({
    queryKey: ["student-level-tests", studentId],
    queryFn: () =>
      api.get<StudentLevelTestsData>(`/students/${studentId}/level-tests`).then((r) => r.data),
  });

  if (isLoading) return <Skeleton className="mb-6 h-24" />;
  // Natija yo'q yoki yuklanmadi — profilni bezovta qilmaymiz.
  if (isError || !data || data.attempts.length === 0) return null;

  const { latest, attempts } = data;
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <p className="font-medium">{t("Daraja testi")}</p>
          {latest ? (
            <p className="text-sm text-muted-foreground">
              {t("Oxirgi natija")}:{" "}
              <span className="font-semibold text-foreground">
                {resultLabel(latest.result)}
              </span>{" "}
              · {format(new Date(latest.startedAt), "dd.MM.yyyy")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("Hali natija chiqmagan")}</p>
          )}
        </div>
        <ul className="flex flex-col divide-y text-sm">
          {attempts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              <span className="tabular-nums text-muted-foreground">
                {format(new Date(a.startedAt), "dd.MM.yyyy, HH:mm")}
              </span>
              <span>{statusLabel(a.status)}</span>
              <span className="tabular-nums">
                {a.answered}/{a.total} · {a.correct} {t("to'g'ri")}
              </span>
              <span className="font-medium">
                {a.result ? resultLabel(a.result) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
