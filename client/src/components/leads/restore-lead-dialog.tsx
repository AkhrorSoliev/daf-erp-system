"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { leadColumnName } from "@/hooks/use-leads-board";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  initialPlace,
  type LeadOrigin,
  type RestoreColumn,
} from "./archive/restore-lead-model";

export type { RestoreColumn };

export interface RestoreLeadTarget {
  id: string;
  firstName: string;
  lastName: string;
  /** Where the lead was; the archive page passes it, the forms page does not. */
  origin?: LeadOrigin | null;
  /** What the restore will change, in the server's words. */
  notes?: string[];
}

/**
 * Arxivdagi lidni tanlangan ustun va bo'limga qaytaradi. Lidlar arxivi ham,
 * forma javoblari sahifasi ham shu dialogni ishlatadi. Asl joyi hali bor
 * bo'lsa, u oldindan tanlanadi.
 */
export function RestoreLeadDialog({
  target,
  columns,
  columnsLoading = false,
  columnsFailed = false,
  onClose,
  onRestored,
}: {
  target: RestoreLeadTarget | null;
  columns: RestoreColumn[];
  columnsLoading?: boolean;
  columnsFailed?: boolean;
  onClose: () => void;
  onRestored: () => void;
}) {
  const t = useT();
  // What the user picked; null = still the suggested place.
  const [picked, setPicked] = useState<{
    columnId: string;
    sectionId: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = !!target;

  useEffect(() => {
    if (open) {
      setPicked(null);
      setSubmitting(false);
    }
  }, [open, target?.id]);

  const place = useMemo(
    () => initialPlace(target?.origin, columns, !columnsLoading),
    [target, columns, columnsLoading],
  );
  const columnId = picked?.columnId ?? place.columnId;
  const sectionId = picked?.sectionId ?? place.sectionId;

  const sections = useMemo(
    () => columns.find((c) => c.id === columnId)?.sections ?? [],
    [columns, columnId],
  );

  async function handleConfirm() {
    if (!target) return;
    if (!columnId || !sectionId) {
      toast.error(t("Ustun va bo'limni tanlang"));
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/leads/${target.id}/restore`, { columnId, sectionId });
      toast.success(t("Lid tiklandi"));
      onRestored();
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
          <DialogTitle>{t("Lidni tiklash")}</DialogTitle>
          <DialogDescription>
            {t("«{name}» lidi qaytariladigan ustun va bo'limni tanlang", {
              name: `${target?.firstName ?? ""} ${target?.lastName ?? ""}`,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {columnsFailed && (
            <p className="text-xs text-destructive">
              {t("Ustunlarni yuklab bo'lmadi. Oynani yopib, qayta oching.")}
            </p>
          )}

          {place.missingLabel && !columnsFailed && (
            <p className="rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground">
              {t("Asl joyi «{place}» arxivda yoki o'chirilgan — yangi joy tanlang.", {
                place: place.missingLabel,
              })}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{t("Ustun")}</Label>
            <Select
              value={columnId}
              onValueChange={(v) => setPicked({ columnId: v, sectionId: "" })}
              disabled={columnsLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    columnsLoading ? t("Yuklanmoqda...") : t("Ustunni tanlang")
                  }
                />
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

          <div className="space-y-1.5">
            <Label>{t("Bo'lim")}</Label>
            <Select
              value={sectionId}
              onValueChange={(v) => setPicked({ columnId, sectionId: v })}
              disabled={!columnId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    columnId
                      ? sections.length
                        ? t("Bo'limni tanlang")
                        : t("Bu ustunda bo'lim yo'q")
                      : t("Avval ustunni tanlang")
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {sections.map((sec) => (
                  <SelectItem key={sec.id} value={sec.id}>
                    {sec.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target?.notes && target.notes.length > 0 && (
            <ul className="space-y-1 rounded-md border bg-muted/50 p-2.5 text-xs text-muted-foreground">
              {target.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
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
