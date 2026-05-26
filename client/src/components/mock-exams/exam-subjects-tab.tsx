"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ExamDetail, MockExamSubject } from "./exam-detail-types";
import { SubjectDialog } from "./subject-dialog";

interface ExamSubjectsTabProps {
  exam: ExamDetail;
  onSubjectsChange: (subjects: MockExamSubject[]) => void;
}

export function ExamSubjectsTab({
  exam,
  onSubjectsChange,
}: ExamSubjectsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MockExamSubject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MockExamSubject | null>(
    null,
  );
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [reordering, setReordering] = useState(false);

  const subjects = exam.subjects;
  const editable =
    exam.status === "REGISTRATION_OPEN" ||
    exam.status === "REGISTRATION_CLOSED";

  function openCreate() {
    setEditTarget(null);
    setDialogOpen(true);
  }

  function openEdit(subject: MockExamSubject) {
    setEditTarget(subject);
    setDialogOpen(true);
  }

  function handleSaved(saved: MockExamSubject) {
    const exists = subjects.some((s) => s.id === saved.id);
    onSubjectsChange(
      exists
        ? subjects.map((s) => (s.id === saved.id ? saved : s))
        : [...subjects, saved].sort((a, b) => a.order - b.order),
    );
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/mock-exam-subjects/${deleteTarget.id}`);
      onSubjectsChange(subjects.filter((s) => s.id !== deleteTarget.id));
      toast.success("Bo'lim o'chirildi");
      setDeleteTarget(null);
    } catch (error) {
      toast.error(getErrorMessage(error, "O'chirishda xatolik"));
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleMove(
    subject: MockExamSubject,
    direction: "up" | "down",
  ) {
    const sorted = [...subjects].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((s) => s.id === subject.id);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sorted.length) return;

    const next = [...sorted];
    [next[idx], next[swap]] = [next[swap], next[idx]];

    setReordering(true);
    const optimistic = next.map((s, i) => ({ ...s, order: i }));
    onSubjectsChange(optimistic);
    try {
      await api.patch(`/mock-exams/${exam.id}/subjects/reorder`, {
        subjectIds: next.map((s) => s.id),
      });
    } catch (error) {
      onSubjectsChange(subjects);
      toast.error(getErrorMessage(error, "Tartibni saqlashda xatolik"));
    } finally {
      setReordering(false);
    }
  }

  const totalMax = subjects.reduce((sum, s) => sum + s.maxScore, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Imtihon bo&apos;limlari</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ballar har bo&apos;lim uchun alohida kiritiladi (masalan: IELTS
            Reading, Writing, Listening, Speaking).
          </p>
        </div>
        {editable && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" />
            Yangi bo&apos;lim
          </Button>
        )}
      </div>

      {!editable && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Bo&apos;limlarni faqat ro&apos;yxat fazasi tugaguniga qadar
          o&apos;zgartirish mumkin. Baholanish boshlanganidan keyin tarkib
          qulflanadi.
        </div>
      )}

      {subjects.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <p className="text-sm text-muted-foreground">
            Hali bo&apos;lim yo&apos;q
          </p>
          {editable && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={openCreate}
            >
              <Plus className="size-4" />
              Birinchi bo&apos;limni qo&apos;shish
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {[...subjects]
            .sort((a, b) => a.order - b.order)
            .map((subject, index, arr) => (
              <div
                key={subject.id}
                className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {subject.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Maksimal: {subject.maxScore} ball
                    </div>
                  </div>
                </div>

                {editable && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={reordering}
                      >
                        {reordering ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-4" />
                        )}
                        <span className="sr-only">Amallar</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEdit(subject)}>
                        <Pencil className="mr-2 size-4" />
                        Tahrirlash
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === 0}
                        onSelect={() => handleMove(subject, "up")}
                      >
                        <ArrowUp className="mr-2 size-4" />
                        Yuqoriga
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={index === arr.length - 1}
                        onSelect={() => handleMove(subject, "down")}
                      >
                        <ArrowDown className="mr-2 size-4" />
                        Pastga
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => setDeleteTarget(subject)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 size-4" />
                        O&apos;chirish
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}

          <div className="flex items-center justify-between rounded-md bg-muted/40 px-4 py-2 text-sm">
            <span className="text-muted-foreground">
              Bo&apos;limlar yig&apos;indisi
            </span>
            <span className="font-medium tabular-nums">
              {totalMax}{" "}
              {totalMax === exam.maxScore ? (
                <span className="text-xs text-emerald-600">
                  (umumiy ballga teng)
                </span>
              ) : (
                <span className="text-xs text-amber-600">
                  (umumiy ball: {exam.maxScore})
                </span>
              )}
            </span>
          </div>
        </div>
      )}

      <SubjectDialog
        subject={editTarget}
        examId={exam.id}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && !deleteBusy && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bo&apos;limni o&apos;chirish</AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{deleteTarget?.name}&quot; bo&apos;limi o&apos;chiriladi.
              Bu bo&apos;lim bo&apos;yicha kiritilgan barcha ballar ham
              o&apos;chiriladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>
              Bekor qilish
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              O&apos;chirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
