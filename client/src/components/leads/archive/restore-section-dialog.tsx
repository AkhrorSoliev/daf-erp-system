"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ArchivedSection, BoardColumn } from "./archive-types";

// ---------------------------------------------------------------------------
// Restore a section — pick a column + with / without its leads
// ---------------------------------------------------------------------------

export function RestoreSectionDialog({
  target,
  columns,
  columnsLoading = false,
  onClose,
  onRestored,
}: {
  target: ArchivedSection | null;
  columns: BoardColumn[];
  columnsLoading?: boolean;
  onClose: () => void;
  onRestored: (result: { restoredLeadCount: number }) => void;
}) {
  const [columnId, setColumnId] = useState("");
  const [withLeads, setWithLeads] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const open = !!target;
  const hasLeads = (target?.leadCount ?? 0) > 0;

  useEffect(() => {
    if (open) {
      // Pre-select the section's original column only if it still exists (it may
      // itself have been deleted); otherwise start empty so the user must pick a
      // live column rather than submit a stale, invalid id.
      const origin = target?.column?.id;
      setColumnId(origin && columns.some((c) => c.id === origin) ? origin : "");
      setWithLeads((target?.leadCount ?? 0) > 0);
      setSubmitting(false);
    }
  }, [open, target, columns]);

  async function handleConfirm() {
    if (!target) return;
    if (!columnId) {
      toast.error("Ustunni tanlang");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<{ restoredLeadCount: number }>(
        `/lead-sections/${target.id}/restore`,
        { targetColumnId: columnId, withLeads: hasLeads ? withLeads : false },
      );
      toast.success("Bo'lim tiklandi");
      onRestored({ restoredLeadCount: data.restoredLeadCount ?? 0 });
    } catch (error) {
      toast.error(getErrorMessage(error, "Tiklashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bo&apos;limni tiklash</DialogTitle>
          <DialogDescription>
            &laquo;{target?.name}&raquo; bo&apos;limi qaytariladigan ustunni
            tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ustun</Label>
            <Select
              value={columnId}
              onValueChange={setColumnId}
              disabled={columnsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ustunni tanlang" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Ustunlar</SelectLabel>
                  {columns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {hasLeads && (
            <div className="space-y-1.5">
              <Label>Ichidagi lidlar ({target?.leadCount} ta)</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={withLeads ? "default" : "outline"}
                  onClick={() => setWithLeads(true)}
                  className={cn("h-auto py-2 text-xs", !withLeads && "font-normal")}
                >
                  Lidlari bilan
                </Button>
                <Button
                  type="button"
                  variant={!withLeads ? "default" : "outline"}
                  onClick={() => setWithLeads(false)}
                  className={cn("h-auto py-2 text-xs", withLeads && "font-normal")}
                >
                  Lidlarsiz (bo&apos;sh)
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {withLeads
                  ? "Bo'lim ichidagi arxivlangan lidlar bilan birga tiklanadi."
                  : "Faqat bo'lim tiklanadi; lidlar arxivda qoladi."}
              </p>
            </div>
          )}
        </div>

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
            type="button"
            onClick={handleConfirm}
            disabled={submitting || columnsLoading}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Tiklash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
