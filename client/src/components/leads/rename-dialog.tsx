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
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";

/** One dialog handles renaming both columns and sections. */
export function RenameDialog() {
  const renameTarget = useLeadsUi((s) => s.renameTarget);
  const closeRename = useLeadsUi((s) => s.closeRename);
  const applyColumnRename = useLeadsBoard((s) => s.applyColumnRename);
  const applySectionRename = useLeadsBoard((s) => s.applySectionRename);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!renameTarget;
  const isColumn = renameTarget?.kind === "column";

  useEffect(() => {
    if (renameTarget) {
      setName(renameTarget.currentName);
      setSubmitting(false);
    }
  }, [renameTarget]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!renameTarget) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nomni kiriting");
      return;
    }
    setSubmitting(true);
    try {
      if (renameTarget.kind === "column") {
        const { data } = await api.patch(`/lead-columns/${renameTarget.id}`, {
          name: trimmed,
        });
        applyColumnRename(renameTarget.id, data.name);
        toast.success("Ustun nomi yangilandi");
      } else {
        const { data } = await api.patch(`/lead-sections/${renameTarget.id}`, {
          name: trimmed,
        });
        applySectionRename(renameTarget.columnId ?? "", renameTarget.id, data.name);
        toast.success("Bo'lim nomi yangilandi");
      }
      closeRename();
    } catch (error) {
      toast.error(getErrorMessage(error, "Nomni yangilashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && closeRename()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isColumn
              ? "Ustun nomini o'zgartirish"
              : "Bo'lim nomini o'zgartirish"}
          </DialogTitle>
          <DialogDescription>Yangi nomni kiriting</DialogDescription>
        </DialogHeader>

        <form id="rename-form" onSubmit={handleSubmit} className="space-y-1.5">
          <Label htmlFor="rename-input">
            {isColumn ? "Ustun nomi" : "Bo'lim nomi"}
          </Label>
          <Input
            id="rename-input"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
          />
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeRename}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="submit" form="rename-form" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
