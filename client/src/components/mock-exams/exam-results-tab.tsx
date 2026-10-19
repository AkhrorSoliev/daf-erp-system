"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  Calculator,
  ClipboardList,
  Loader2,
  Save,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MOCK_EXAM_STATUS_LABELS } from "@/hooks/use-mock-exams-board";
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import { formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ExamDetail } from "./exam-detail-types";
import {
  buildScoresPayload,
  scoreKey,
  type ScoreMap,
  type ScoresPayloadEntry,
} from "./results-payload";

interface ExamResultsTabProps {
  exam: ExamDetail;
}

interface MatrixSubject {
  id: string;
  name: string;
  maxScore: number;
  passingScore: number | null;
  order: number;
}

interface MatrixParticipant {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  totalScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  rank: number | null;
  feedback: string | null;
  gradedAt: string | null;
  scoresBySubjectId: Record<string, number>;
}

interface MatrixResponse {
  exam: {
    id: string;
    title: string;
    status: string;
    maxScore: number;
    passingScore: number | null;
  };
  subjects: MatrixSubject[];
  participants: MatrixParticipant[];
}

// Map keyed by `${participantId}:${subjectId}` → input value as string.
// Strings let users clear an input ("") without forcing 0, and let us track
// "edited" state separately from "saved".


export function ExamResultsTab({ exam }: ExamResultsTabProps) {
  const t = useT();
  // The load reads t from here: a language switch must not refetch.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ranking, setRanking] = useState(false);

  const [edits, setEdits] = useState<ScoreMap>(new Map());
  const initialRef = useRef<ScoreMap>(new Map());

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<MatrixResponse>(
        `/mock-exams/${exam.id}/results-matrix`,
      );
      setMatrix(data);

      // Seed both initial and edits from current scores.
      const seed: ScoreMap = new Map();
      for (const p of data.participants) {
        for (const s of data.subjects) {
          const score = p.scoresBySubjectId[s.id];
          if (score !== undefined && score !== null) {
            seed.set(scoreKey(p.id, s.id), String(score));
          }
        }
      }
      initialRef.current = new Map(seed);
      setEdits(seed);
    } catch (error) {
      const t = tRef.current;
      toast.error(getErrorMessage(error, t("Natijalarni yuklashda xatolik")));
    } finally {
      setLoading(false);
    }
  }, [exam.id]);

  useEffect(() => {
    void fetchMatrix();
  }, [fetchMatrix]);

  const handleScoreChange = useCallback(
    (pid: string, sid: string, value: string) => {
      setEdits((prev) => {
        const next = new Map(prev);
        if (value === "") {
          next.delete(scoreKey(pid, sid));
        } else {
          next.set(scoreKey(pid, sid), value);
        }
        return next;
      });
    },
    [],
  );

  const dirtyParticipantIds = useMemo(() => {
    const initial = initialRef.current;
    const dirty = new Set<string>();
    // Edits that differ from initial
    edits.forEach((value, key) => {
      const pid = key.split(":")[0];
      if (initial.get(key) !== value) dirty.add(pid);
    });
    // Initial keys that were cleared
    initial.forEach((_value, key) => {
      const pid = key.split(":")[0];
      if (!edits.has(key)) dirty.add(pid);
    });
    return dirty;
  }, [edits]);

  function validateAndBuildPayload(): {
    participants: ScoresPayloadEntry[];
  } | null {
    if (!matrix) return null;
    const res = buildScoresPayload(
      matrix.subjects,
      dirtyParticipantIds,
      edits,
      initialRef.current,
      t,
    );
    if (!res.ok) {
      toast.error(res.error);
      return null;
    }
    return { participants: res.participants };
  }

  async function handleSave() {
    if (!matrix) return;
    const payload = validateAndBuildPayload();
    if (!payload || payload.participants.length === 0) {
      toast(t("Saqlanadigan o'zgarish topilmadi"));
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post<MatrixResponse>(
        `/mock-exams/${exam.id}/scores/bulk`,
        payload,
      );
      setMatrix(data);
      // Refresh initial snapshot
      const seed: ScoreMap = new Map();
      for (const p of data.participants) {
        for (const s of data.subjects) {
          const score = p.scoresBySubjectId[s.id];
          if (score !== undefined && score !== null) {
            seed.set(scoreKey(p.id, s.id), String(score));
          }
        }
      }
      initialRef.current = new Map(seed);
      setEdits(seed);
      toast.success(
        t("{n} ishtirokchi natijasi saqlandi", {
          n: formatNumber(payload.participants.length),
        }),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, t("Saqlashda xatolik")));
    } finally {
      setSaving(false);
    }
  }

  async function handleRecalculateRanks() {
    setRanking(true);
    try {
      await api.post(`/mock-exams/${exam.id}/recalculate-ranks`);
      toast.success(t("O'rinlar qayta hisoblandi"));
      await fetchMatrix();
    } catch (error) {
      toast.error(getErrorMessage(error, t("O'rinlarni hisoblashda xatolik")));
    } finally {
      setRanking(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!matrix) return null;

  const isGrading = exam.status === "GRADING";
  const canEdit = isGrading;
  const subjects = matrix.subjects;
  const participants = matrix.participants;
  // Status words are `msg()` texts: bind to a local before `t`.
  const gradingLabel = MOCK_EXAM_STATUS_LABELS.GRADING;
  const statusLabel: string | undefined = MOCK_EXAM_STATUS_LABELS[exam.status];

  if (subjects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <ClipboardList className="mx-auto size-8 text-muted-foreground opacity-50" />
        <p className="mt-2 text-sm font-medium">{t("Hali bo'lim yo'q")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Ball kiritish uchun avval imtihon bo'limlarini sozlang")}
        </p>
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-16 text-center">
        <ClipboardList className="mx-auto size-8 text-muted-foreground opacity-50" />
        <p className="mt-2 text-sm font-medium">
          {t("Hali ishtirokchi yo'q")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("Ball kiritish uchun avval ishtirokchilar ro'yxatga olinishi kerak")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("Natijalar")}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("Jami: {n} ishtirokchi · {sections} bo'lim", {
              n: formatNumber(participants.length),
              sections: formatNumber(subjects.length),
            })}
            {dirtyParticipantIds.size > 0 && (
              <>
                {" · "}
                <span className="text-amber-600">
                  {t("{n} ta saqlanmagan", {
                    n: formatNumber(dirtyParticipantIds.size),
                  })}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleRecalculateRanks}
            disabled={ranking || saving}
          >
            {ranking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Award className="size-4" />
            )}
            {t("O'rinlarni qayta hisoblash")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || ranking || dirtyParticipantIds.size === 0 || !canEdit}
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            <Save className="size-4" />
            {t("Saqlash")}
          </Button>
        </div>
      </div>

      {!isGrading && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          {t("Ballarni faqat «{status}» holatida kiritish mumkin.", {
            status: t(gradingLabel),
          })}{" "}
          {t("Hozirgi holat:")}{" "}
          <strong>{statusLabel ? t(statusLabel) : exam.status}</strong>.{" "}
          {t("Holatni sahifa tepasidagi bosqichlar qatoridan o'zgartiring.")}
        </div>
      )}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead className="min-w-48 border-r">
                {t("Ishtirokchi")}
              </TableHead>
              {subjects.map((s) => (
                <TableHead key={s.id} className="text-center">
                  {s.name}
                </TableHead>
              ))}
              <TableHead className="text-center">{t("O'rin")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {participants.map((p, index) => {
              const isDirty = dirtyParticipantIds.has(p.id);
              return (
                <TableRow key={p.id} className={isDirty ? "bg-amber-50/40 dark:bg-amber-950/20" : ""}>
                  <TableCell className="border-r text-muted-foreground">
                    {index + 1}
                  </TableCell>
                  <TableCell className="border-r">
                    <div className="text-sm font-medium">
                      {p.firstName} {p.lastName}
                    </div>
                  </TableCell>
                  {subjects.map((s) => {
                    const key = scoreKey(p.id, s.id);
                    const value = edits.get(key) ?? "";
                    // Per-cell color when both the value and the subject's
                    // passing bar are known: green if >= passingScore, red
                    // otherwise. Empty cells stay neutral.
                    const numeric = value === "" ? null : Number(value);
                    const scored =
                      numeric !== null && Number.isFinite(numeric);
                    const passed =
                      scored &&
                      s.passingScore !== null &&
                      numeric! >= s.passingScore;
                    const failed =
                      scored &&
                      s.passingScore !== null &&
                      numeric! < s.passingScore;
                    const cellBg = passed
                      ? "bg-emerald-50 dark:bg-emerald-950/40"
                      : failed
                        ? "bg-red-50 dark:bg-red-950/40"
                        : "";
                    return (
                      <TableCell
                        key={s.id}
                        className={`p-1.5 text-center ${cellBg}`}
                      >
                        <Input
                          type="number"
                          min={0}
                          max={s.maxScore}
                          step="any"
                          value={value}
                          disabled={!canEdit}
                          onChange={(e) =>
                            handleScoreChange(p.id, s.id, e.target.value)
                          }
                          className="h-8 w-20 text-center tabular-nums"
                        />
                      </TableCell>
                    );
                  })}
                  <TableCell className="text-center text-sm tabular-nums">
                    {p.rank !== null ? (
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {p.rank}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        <Calculator className="mr-1 inline size-3" />
        <span className="text-destructive">
          {t("Qizil — bo'limning o'tish balidan past")}
        </span>
        {", "}
        <span className="text-emerald-600">
          {t("yashil — o'tish baliga yetgan")}
        </span>
        {". "}
        {t("Ballar saqlangach «O'rin» ustunini yuqoridagi tugma bilan qayta hisoblang.")}
      </div>
    </div>
  );
}
