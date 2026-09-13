"use client";

import { useEffect, useMemo, useState } from "react";
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RestoreLeadTarget {
  id: string;
  firstName: string;
  lastName: string;
}

export interface RestoreColumn {
  id: string;
  name: string;
  sections: { id: string; name: string }[];
}

/**
 * Arxivdagi lidni tanlangan ustun va bo'limga qaytaradi. Lidlar arxivi ham,
 * forma javoblari sahifasi ham shu dialogni ishlatadi.
 */
export function RestoreLeadDialog({
  target,
  columns,
  onClose,
  onRestored,
}: {
  target: RestoreLeadTarget | null;
  columns: RestoreColumn[];
  onClose: () => void;
  onRestored: () => void;
}) {
  const [columnId, setColumnId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!target;

  useEffect(() => {
    if (open) {
      setColumnId("");
      setSectionId("");
      setSubmitting(false);
    }
  }, [open]);

  const sections = useMemo(
    () => columns.find((c) => c.id === columnId)?.sections ?? [],
    [columns, columnId],
  );

  async function handleConfirm() {
    if (!target) return;
    if (!columnId || !sectionId) {
      toast.error("Ustun va bo'limni tanlang");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/leads/${target.id}/restore`, { columnId, sectionId });
      toast.success("Lid tiklandi");
      onRestored();
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
          <DialogTitle>Lidni tiklash</DialogTitle>
          <DialogDescription>
            &laquo;{target?.firstName} {target?.lastName}&raquo; lidi
            qaytariladigan ustun va bo&apos;limni tanlang
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Ustun</Label>
            <Select
              value={columnId}
              onValueChange={(v) => {
                setColumnId(v);
                setSectionId("");
              }}
            >
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

          <div className="space-y-1.5">
            <Label>Bo&apos;lim</Label>
            <Select
              value={sectionId}
              onValueChange={setSectionId}
              disabled={!columnId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    columnId
                      ? sections.length
                        ? "Bo'limni tanlang"
                        : "Bu ustunda bo'lim yo'q"
                      : "Avval ustunni tanlang"
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
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Tiklash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
