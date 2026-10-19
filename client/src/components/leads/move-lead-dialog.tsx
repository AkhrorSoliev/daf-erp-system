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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { leadColumnName, useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { useT } from "@/i18n/context";

/** Keyboard-friendly fallback for moving a lead without drag-and-drop. */
export function MoveLeadDialog() {
  const t = useT();
  const moveTarget = useLeadsUi((s) => s.moveLead);
  const closeMoveLead = useLeadsUi((s) => s.closeMoveLead);
  const board = useLeadsBoard((s) => s.board);
  const moveLead = useLeadsBoard((s) => s.moveLead);

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
      toast.error(t("Bo'limni tanlang"));
      return;
    }
    setSubmitting(true);
    await moveLead(moveTarget.id, moveTarget.sectionId, target);
    setSubmitting(false);
    closeMoveLead();
  }

  // Every section except the one the lead is already in.
  const columns = board
    .map((col) => ({
      ...col,
      sections: col.sections.filter((s) => s.id !== moveTarget?.sectionId),
    }))
    .filter((col) => col.sections.length > 0);
  // On "Barcha filiallar" column names repeat across branches — prefix them.
  const showBranch = new Set(board.map((c) => c.branchId)).size > 1;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeMoveLead()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Lidni ko'chirish")}</DialogTitle>
          <DialogDescription>
            {t("Lid ko'chiriladigan bo'limni tanlang")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>{t("Bo'lim")}</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder={t("Bo'limni tanlang")} />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectGroup key={col.id}>
                  <SelectLabel>
                    {showBranch && col.branch
                      ? `${col.branch.name} · ${leadColumnName(col, t)}`
                      : leadColumnName(col, t)}
                  </SelectLabel>
                  {col.sections.map((sec) => (
                    <SelectItem key={sec.id} value={sec.id}>
                      {sec.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeMoveLead}
            disabled={submitting}
          >
            {t("Bekor qilish")}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t("Lidni ko'chirish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
