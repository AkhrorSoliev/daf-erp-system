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
import { useLeadsBoard, type LeadBoardColumn } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";

export function CreateColumnDialog() {
  const open = useLeadsUi((s) => s.createColumnOpen);
  const closeCreateColumn = useLeadsUi((s) => s.closeCreateColumn);
  const addColumn = useLeadsBoard((s) => s.addColumn);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Ustun nomini kiriting");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<LeadBoardColumn>("/lead-columns", {
        name: trimmed,
      });
      addColumn(data);
      toast.success("Ustun yaratildi");
      closeCreateColumn();
    } catch (error) {
      toast.error(getErrorMessage(error, "Ustun yaratishda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeCreateColumn()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi ustun</DialogTitle>
          <DialogDescription>
            Board oxiriga yangi ustun qo&apos;shiladi
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-column-form"
          onSubmit={handleSubmit}
          className="space-y-1.5"
        >
          <Label htmlFor="column-name">Ustun nomi</Label>
          <Input
            id="column-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Masalan: Sinovga yozildi"
            maxLength={100}
          />
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeCreateColumn}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="submit" form="create-column-form" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Yaratish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
