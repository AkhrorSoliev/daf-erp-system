"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { MockExamSubject } from "./exam-detail-types";

interface SubjectDialogProps {
  /** When set, dialog is in edit mode. When null/undefined and `examId` is set, create mode. */
  subject: MockExamSubject | null;
  /** Required for create mode. */
  examId: string | null;
  open: boolean;
  onClose: () => void;
  onSaved: (subject: MockExamSubject) => void;
}

export function SubjectDialog({
  subject,
  examId,
  open,
  onClose,
  onSaved,
}: SubjectDialogProps) {
  const [name, setName] = useState("");
  const [maxScore, setMaxScore] = useState("30");
  const [submitting, setSubmitting] = useState(false);

  const isEdit = !!subject;

  useEffect(() => {
    if (open) {
      setName(subject?.name ?? "");
      setMaxScore(subject ? String(subject.maxScore) : "30");
      setSubmitting(false);
    }
  }, [open, subject]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Bo'lim nomini kiriting");
      return;
    }
    const max = Number(maxScore);
    if (!Number.isFinite(max) || max <= 0) {
      toast.error("Maksimal ball noto'g'ri");
      return;
    }

    setSubmitting(true);
    try {
      if (isEdit && subject) {
        const { data } = await api.patch<MockExamSubject>(
          `/mock-exam-subjects/${subject.id}`,
          { name: trimmed, maxScore: max },
        );
        onSaved(data);
        toast.success("Bo'lim yangilandi");
      } else if (examId) {
        const { data } = await api.post<MockExamSubject>(
          `/mock-exams/${examId}/subjects`,
          { name: trimmed, maxScore: max },
        );
        onSaved(data);
        toast.success("Bo'lim qo'shildi");
      }
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Bo'limni tahrirlash" : "Yangi bo'lim"}
          </DialogTitle>
          <DialogDescription>
            Imtihon bo&apos;limlari (masalan: Reading, Writing, Listening,
            Speaking) — har biri o&apos;z maksimal balliga ega.
          </DialogDescription>
        </DialogHeader>

        <form
          id="subject-dialog-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="subject-name">Bo&apos;lim nomi</Label>
            <Input
              id="subject-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: Reading"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subject-max-score">Maksimal ball</Label>
            <Input
              id="subject-max-score"
              type="number"
              min={1}
              step="any"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            type="submit"
            form="subject-dialog-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Saqlash" : "Qo'shish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
