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
import { leadColumnName } from "@/hooks/use-leads-board";
import { useT } from "@/i18n/context";

// ---------------------------------------------------------------------------
// Restore a section — pick a column + with / without its leads
// ---------------------------------------------------------------------------

export function RestoreSectionDialog({
  target,
  columns,
  columnsLoading = false,
  columnsFailed = false,
  onClose,
  onRestored,
}: {
  target: ArchivedSection | null;
  columns: BoardColumn[];
  columnsLoading?: boolean;
  columnsFailed?: boolean;
  onClose: () => void;
  onRestored: (result: { restoredLeadCount: number }) => void;
}) {
  const t = useT();
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
      toast.error(t("Ustunni tanlang"));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<{ restoredLeadCount: number }>(
        `/lead-sections/${target.id}/restore`,
        { targetColumnId: columnId, withLeads: hasLeads ? withLeads : false },
      );
      toast.success(t("Bo'lim tiklandi"));
      onRestored({ restoredLeadCount: data.restoredLeadCount ?? 0 });
    } catch (error) {
      toast.error(getErrorMessage(error, t("Tiklashda xatolik")));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Bo'limni tiklash")}</DialogTitle>
          <DialogDescription>
            {t("«{name}» bo'limi qaytariladigan ustunni tanlang", {
              name: target?.name ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {columnsFailed && (
            <p className="text-xs text-destructive">
              {t("Ustunlarni yuklab bo'lmadi. Oynani yopib, qayta oching.")}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{t("Ustun")}</Label>
            <Select
              value={columnId}
              onValueChange={setColumnId}
              disabled={columnsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("Ustunni tanlang")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("Ustunlar")}</SelectLabel>
                  {columns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {leadColumnName(col, t)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {hasLeads && (
            <div className="space-y-1.5">
              <Label>
                {t("Ichidagi lidlar ({n} ta)", { n: target?.leadCount ?? 0 })}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={withLeads ? "default" : "outline"}
                  onClick={() => setWithLeads(true)}
                  className={cn("h-auto py-2 text-xs", !withLeads && "font-normal")}
                >
                  {t("Lidlari bilan")}
                </Button>
                <Button
                  type="button"
                  variant={!withLeads ? "default" : "outline"}
                  onClick={() => setWithLeads(false)}
                  className={cn("h-auto py-2 text-xs", withLeads && "font-normal")}
                >
                  {t("Lidlarsiz (bo'sh)")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {withLeads
                  ? t("Bo'lim ichidagi arxivlangan lidlar bilan birga tiklanadi.")
                  : t("Faqat bo'lim tiklanadi; lidlar arxivda qoladi.")}
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
            {t("Bekor qilish")}
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || columnsLoading || columnsFailed}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t("Tiklash")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
