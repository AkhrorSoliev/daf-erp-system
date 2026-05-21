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

export function CreateSectionDialog() {
  const createSection = useLeadsUi((s) => s.createSection);
  const closeCreateSection = useLeadsUi((s) => s.closeCreateSection);
  const addSection = useLeadsBoard((s) => s.addSection);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!createSection;

  useEffect(() => {
    if (open) {
      setName("");
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!createSection) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Bo'lim nomini kiriting");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/lead-sections", {
        columnId: createSection.columnId,
        name: trimmed,
      });
      addSection({
        id: data.id,
        name: data.name,
        order: data.order,
        leadCount: data.leadCount ?? 0,
        columnId: data.columnId,
      });
      toast.success("Bo'lim yaratildi");
      closeCreateSection();
    } catch (error) {
      toast.error(getErrorMessage(error, "Bo'lim yaratishda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeCreateSection()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi bo&apos;lim</DialogTitle>
          <DialogDescription>
            &quot;{createSection?.columnName}&quot; ustuniga yangi bo&apos;lim
            qo&apos;shing
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-section-form"
          onSubmit={handleSubmit}
          className="space-y-1.5"
        >
          <Label htmlFor="section-name">Bo&apos;lim nomi</Label>
          <Input
            id="section-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Masalan: Instagram reklama"
            maxLength={100}
          />
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeCreateSection}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="submit" form="create-section-form" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Yaratish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
