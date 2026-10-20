"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { leadColumnName, useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { useT } from "@/i18n/context";

/** Keyboard-friendly fallback for moving a section to another column. */
export function MoveSectionDialog() {
  const t = useT();
  const moveTarget = useLeadsUi((s) => s.moveSection);
  const closeMoveSection = useLeadsUi((s) => s.closeMoveSection);
  const board = useLeadsBoard((s) => s.board);
  const moveSectionToColumn = useLeadsBoard((s) => s.moveSectionToColumn);

  const [target, setTarget] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!moveTarget;

  useEffect(() => {
    if (open) {
      setTarget("");
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!moveTarget) return;
    if (!target) {
      toast.error(t("Ustunni tanlang"));
      return;
    }
    setSubmitting(true);
    await moveSectionToColumn(moveTarget.id, moveTarget.columnId, target);
    setSubmitting(false);
    closeMoveSection();
  }

  // Every other column of the section's own branch — the server refuses a
  // move across branches ("Barcha filiallar" lists several boards).
  const fromBranchId = board.find((c) => c.id === moveTarget?.columnId)?.branchId;
  const columns = board.filter(
    (c) => c.id !== moveTarget?.columnId && c.branchId === fromBranchId,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeMoveSection()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Bo'limni ko'chirish")}</DialogTitle>
          <DialogDescription>
            {t("«{name}» bo'limi ko'chiriladigan ustunni tanlang", {
              name: moveTarget?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>{t("Ustun")}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder={t("Ustunni tanlang")} />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {leadColumnName(col, t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeMoveSection}
            disabled={submitting}
          >
            {t("Bekor qilish")}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t("Bo'limni ko'chirish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
