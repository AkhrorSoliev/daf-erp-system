"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";

export interface AddCallbackPrefill {
  entityType: "Student" | "Lead";
  entityId: string;
  entityLabel: string;
  entityPhone: string | null;
}

interface AddCallbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: AddCallbackPrefill | null;
}

type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

const PRIORITY_OPTIONS: { value: Priority; label: string }[] = [
  { value: "LOW", label: "Past" },
  { value: "MEDIUM", label: "O'rta" },
  { value: "HIGH", label: "Yuqori" },
  { value: "URGENT", label: "Shoshilinch" },
];

function defaultDueDate(): Date {
  // Sukut: ertangi 10:00. Agar ertaga yakshanba bo'lsa — dushanbaga
  // ko'chiramiz. Tongning 10:00 ish soati ichida (08:00–18:00) tushadi.
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setHours(10, 0, 0, 0);
  while (d.getDay() === 0) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

export function AddCallbackDialog({
  open,
  onOpenChange,
  prefill,
}: AddCallbackDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {/* Inner form is conditionally rendered: each time the dialog opens
         * the form remounts and its useState initializers run fresh. This
         * avoids a setState-in-effect reset pattern. */}
        {open && prefill && (
          <CallbackForm
            prefill={prefill}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CallbackForm({
  prefill,
  onSuccess,
  onCancel,
}: {
  prefill: AddCallbackPrefill;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const user = useAuth((s) => s.user);
  const queryClient = useQueryClient();
  const initial = defaultDueDate();
  const [date, setDate] = useState<Date | null>(initial);
  const [time, setTime] = useState<string>(format(initial, "HH:mm"));
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [text, setText] = useState("");

  const dueDateIso = useMemo(() => {
    if (!date) return null;
    const [h, m] = time.split(":").map(Number);
    const d = new Date(date);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }, [date, time]);

  const trimmedText = text.trim();
  const canSubmit = !!dueDateIso && trimmedText.length > 0 && !!user;

  const submit = useMutation({
    mutationFn: async () => {
      if (!dueDateIso || !user) throw new Error("Invalid state");
      await api.post("/comments", {
        entityType: prefill.entityType,
        entityId: prefill.entityId,
        content: trimmedText,
        isTask: true,
        dueDate: dueDateIso,
        priority,
        assigneeIds: [user.id],
      });
    },
    onSuccess: () => {
      toast.success("Qo'ng'iroq vazifasi yaratildi");
      queryClient.invalidateQueries({ queryKey: ["outreach", "callbacks"] });
      onSuccess();
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Yaratishda xatolik yuz berdi")),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Qo&apos;ng&apos;iroq vazifasi qo&apos;shish</DialogTitle>
      </DialogHeader>

      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {prefill.entityType === "Lead" ? "Lid" : "O'quvchi"}
        </div>
        <div className="font-medium">{prefill.entityLabel}</div>
        {prefill.entityPhone && (
          <div className="text-xs text-muted-foreground">
            {formatPhone(prefill.entityPhone)}
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Sana</Label>
            <DatePicker
              value={date}
              onChange={(d) => setDate(d ?? null)}
              minDate={new Date()}
              disabledDaysOfWeek={[0]}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vaqt</Label>
            <TimePicker
              value={time}
              onChange={setTime}
              minTime="08:00"
              maxTime="18:00"
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Muhimlik</Label>
          <Select
            value={priority}
            onValueChange={(v) => setPriority(v as Priority)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Izoh (qo&apos;ng&apos;iroq haqida)</Label>
          <Textarea
            placeholder="Masalan: Davomat past bo'lganligi haqida ota-onaga qo'ng'iroq qilish"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={submit.isPending}
        >
          Bekor qilish
        </Button>
        <Button
          onClick={() => submit.mutate()}
          disabled={!canSubmit || submit.isPending}
        >
          {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Saqlash
        </Button>
      </DialogFooter>
    </>
  );
}

function formatPhone(phone: string) {
  return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)}`;
}
