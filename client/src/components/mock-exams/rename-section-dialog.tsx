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
import {
  useMockExamsBoard,
  type MockExamSection,
} from "@/hooks/use-mock-exams-board";
import { COLOR_PRESETS } from "./create-section-dialog";

interface RenameSectionDialogProps {
  section: MockExamSection | null;
  onClose: () => void;
}

export function RenameSectionDialog({
  section,
  onClose,
}: RenameSectionDialogProps) {
  const updateSection = useMockExamsBoard((s) => s.updateSection);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const open = !!section;

  useEffect(() => {
    if (section) {
      setName(section.name);
      setColor(section.color);
      setSubmitting(false);
    }
  }, [section]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!section) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Bo'lim nomini kiriting");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.patch<{ name: string; color: string | null }>(
        `/mock-exam-sections/${section.id}`,
        { name: trimmed, color },
      );
      updateSection(section.id, { name: data.name, color: data.color });
      toast.success("Bo'lim yangilandi");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !submitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bo&apos;limni tahrirlash</DialogTitle>
          <DialogDescription>
            Bo&apos;lim nomi va rangini o&apos;zgartiring
          </DialogDescription>
        </DialogHeader>

        <form
          id="rename-mock-section-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="rename-section-name">Bo&apos;lim nomi</Label>
            <Input
              id="rename-section-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Rang</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`size-8 rounded-full border-2 transition ${
                    color === c.value
                      ? "scale-110 border-foreground"
                      : "border-transparent"
                  }`}
                  style={{ backgroundColor: c.value }}
                  aria-label={c.label}
                  title={c.label}
                />
              ))}
            </div>
          </div>
        </form>

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
            type="submit"
            form="rename-mock-section-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
