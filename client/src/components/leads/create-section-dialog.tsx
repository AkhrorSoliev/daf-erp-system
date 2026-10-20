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
import { useT } from "@/i18n/context";

export function CreateSectionDialog() {
  const t = useT();
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
      toast.error(t("Bo'lim nomini kiriting"));
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
      toast.success(t("Bo'lim yaratildi"));
      closeCreateSection();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Bo'lim yaratishda xatolik yuz berdi")));
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
          <DialogTitle>{t("Yangi bo'lim")}</DialogTitle>
          <DialogDescription>
            {t("\"{column}\" ustuniga yangi bo'lim qo'shing", {
              column: createSection?.columnName ?? "",
            })}
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-section-form"
          onSubmit={handleSubmit}
          className="space-y-1.5"
        >
          <Label htmlFor="section-name">{t("Bo'lim nomi")}</Label>
          <Input
            id="section-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("Masalan: Instagram reklama")}
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
            {t("Bekor qilish")}
          </Button>
          <Button type="submit" form="create-section-form" disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t("Yaratish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
