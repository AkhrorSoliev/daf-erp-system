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

const COLOR_PRESETS = [
  { value: "#3b82f6", label: "Ko'k" },
  { value: "#8b5cf6", label: "Binafsha" },
  { value: "#ef4444", label: "Qizil" },
  { value: "#10b981", label: "Yashil" },
  { value: "#f59e0b", label: "Sariq" },
  { value: "#06b6d4", label: "Moviy" },
  { value: "#ec4899", label: "Pushti" },
  { value: "#64748b", label: "Kulrang" },
];

interface CreateSectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateSectionDialog({
  open,
  onOpenChange,
}: CreateSectionDialogProps) {
  const addSection = useMockExamsBoard((s) => s.addSection);

  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(COLOR_PRESETS[0].value);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setColor(COLOR_PRESETS[0].value);
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Bo'lim nomini kiriting");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<MockExamSection>(
        "/mock-exam-sections",
        { name: trimmed, color },
      );
      addSection(data);
      toast.success("Bo'lim yaratildi");
      onOpenChange(false);
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Bo'lim yaratishda xatolik yuz berdi"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && onOpenChange(false)}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Yangi bo&apos;lim</DialogTitle>
          <DialogDescription>
            Mock imtihonlar uchun yangi bo&apos;lim qo&apos;shing
          </DialogDescription>
        </DialogHeader>

        <form
          id="create-mock-section-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="section-name">Bo&apos;lim nomi</Label>
            <Input
              id="section-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Masalan: IELTS Mock"
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
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            type="submit"
            form="create-mock-section-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Yaratish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { COLOR_PRESETS };
