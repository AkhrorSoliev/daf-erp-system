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
import { useLeadsBoard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";

/** Keyboard-friendly fallback for moving a section to another column. */
export function MoveSectionDialog() {
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
      toast.error("Ustunni tanlang");
      return;
    }
    setSubmitting(true);
    await moveSectionToColumn(moveTarget.id, moveTarget.columnId, target);
    setSubmitting(false);
    closeMoveSection();
  }

  // Every column except the one the section is already in.
  const columns = board.filter((c) => c.id !== moveTarget?.columnId);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeMoveSection()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bo&apos;limni ko&apos;chirish</DialogTitle>
          <DialogDescription>
            &laquo;{moveTarget?.name}&raquo; bo&apos;limi ko&apos;chiriladigan
            ustunni tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Ustun</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue placeholder="Ustunni tanlang" />
            </SelectTrigger>
            <SelectContent>
              {columns.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.name}
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
            Bekor qilish
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Ko&apos;chirish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
