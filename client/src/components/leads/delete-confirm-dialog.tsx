"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";

/** One confirmation dialog for deleting a column, a section, or a lead. */
export function DeleteConfirmDialog() {
  const deleteTarget = useLeadsUi((s) => s.deleteTarget);
  const closeDelete = useLeadsUi((s) => s.closeDelete);
  const applyColumnRemove = useLeadsBoard((s) => s.applyColumnRemove);
  const applySectionRemove = useLeadsBoard((s) => s.applySectionRemove);
  const applyLeadRemove = useLeadsBoard((s) => s.applyLeadRemove);

  const [deleting, setDeleting] = useState(false);
  const [reason, setReason] = useState("");

  const open = !!deleteTarget;
  const kind = deleteTarget?.kind;
  const isLead = kind === "lead";

  // Reset the reason whenever a different target is opened.
  useEffect(() => {
    if (deleteTarget) setReason("");
  }, [deleteTarget]);

  // A lead delete = marking it LOST, which requires a reason.
  const reasonMissing = isLead && !reason.trim();

  async function handleConfirm() {
    if (!deleteTarget) return;
    if (reasonMissing) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "column") {
        await api.delete(`/lead-columns/${deleteTarget.id}`);
        applyColumnRemove(deleteTarget.id);
        toast.success("Ustun o'chirildi");
      } else if (deleteTarget.kind === "section") {
        await api.delete(`/lead-sections/${deleteTarget.id}`);
        applySectionRemove(deleteTarget.columnId ?? "", deleteTarget.id);
        toast.success("Bo'lim arxivga ko'chirildi");
      } else {
        await api.delete(`/leads/${deleteTarget.id}`, {
          data: { reason: reason.trim() },
        });
        applyLeadRemove(deleteTarget.sectionId ?? "", deleteTarget.id);
        toast.success("Lid yo'qotilgan deb belgilandi");
      }
      closeDelete();
    } catch (error) {
      toast.error(getErrorMessage(error, "O'chirishda xatolik yuz berdi"));
    } finally {
      setDeleting(false);
    }
  }

  const title =
    kind === "column"
      ? "Ustunni o'chirish"
      : kind === "section"
        ? "Bo'limni o'chirish"
        : "Lidni o'chirish";

  const description =
    kind === "column"
      ? "ustuni arxivga ko'chiriladi. Ustun faqat ichida bo'lim qolmaganda o'chiriladi."
      : kind === "section"
        ? "bo'limi va undagi barcha lidlar arxivga ko'chiriladi. Ularni keyinchalik arxivdan tiklash mumkin."
        : "lidi «Yo'qotilgan» deb belgilanadi va arxivga ko'chiriladi. Uni keyinchalik arxivdan tiklash mumkin.";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => !o && !deleting && closeDelete()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            &laquo;{deleteTarget?.name}&raquo; {description}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLead && (
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">
              Yo&apos;qotilish sababi <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="lost-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Masalan: narx qimmat keldi, javob bermadi, boshqa markazga ketdi..."
              maxLength={500}
              rows={3}
              disabled={deleting}
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>
            Bekor qilish
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={deleting || reasonMissing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="mr-2 size-4 animate-spin" />}
            O&apos;chirish
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
