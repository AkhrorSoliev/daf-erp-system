"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  useMockExamsBoard,
  type MockExamSection,
} from "@/hooks/use-mock-exams-board";

interface DeleteSectionDialogProps {
  section: MockExamSection | null;
  onClose: () => void;
}

export function DeleteSectionDialog({
  section,
  onClose,
}: DeleteSectionDialogProps) {
  const removeSection = useMockExamsBoard((s) => s.removeSection);
  const [submitting, setSubmitting] = useState(false);

  const open = !!section;

  async function handleConfirm() {
    if (!section) return;
    setSubmitting(true);
    try {
      await api.delete(`/mock-exam-sections/${section.id}`);
      removeSection(section.id);
      toast.success("Bo'lim o'chirildi");
      onClose();
    } catch (error) {
      toast.error(
        getErrorMessage(error, "O'chirishda xatolik yuz berdi"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => !o && !submitting && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bo&apos;limni o&apos;chirish</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{section?.name}&quot; bo&apos;limini o&apos;chirmoqchimisiz?
            {section && section.examCount > 0 && (
              <span className="mt-2 block text-destructive">
                Bo&apos;limda {section.examCount} ta imtihon bor. Avval
                imtihonlarni boshqa bo&apos;limga ko&apos;chiring yoki
                o&apos;chiring.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            Bekor qilish
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={submitting || (section?.examCount ?? 0) > 0}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            O&apos;chirish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
