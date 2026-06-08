"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
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
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatBalance } from "@/lib/format-utils";

export interface PromiseTarget {
  id: number;
  firstName: string;
  lastName: string;
  balance: number;
}

interface AddPaymentPromiseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: PromiseTarget | null;
  onSuccess?: () => void;
}

export function AddPaymentPromiseDialog({
  open,
  onOpenChange,
  student,
  onSuccess,
}: AddPaymentPromiseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        {/* Remounts on each open so the form's useState initializers run fresh. */}
        {open && student && (
          <PromiseForm
            student={student}
            onSuccess={() => {
              onSuccess?.();
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PromiseForm({
  student,
  onSuccess,
  onCancel,
}: {
  student: PromiseTarget;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [date, setDate] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d;
  });
  const [comment, setComment] = useState("");

  const today = useMemo(() => new Date(), []);

  // The promise is "by end of the chosen day" — the overdue cron the next
  // morning flips it only if still unpaid by then.
  const promiseDateIso = useMemo(() => {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(23, 59, 59, 0);
    return d.toISOString();
  }, [date]);

  const trimmed = comment.trim();
  const canSubmit = !!promiseDateIso && trimmed.length > 0;

  const submit = useMutation({
    mutationFn: async () => {
      if (!promiseDateIso) throw new Error("Invalid state");
      await api.post("/payment-promises", {
        studentId: student.id,
        promiseDate: promiseDateIso,
        comment: trimmed,
      });
    },
    onSuccess: () => {
      toast.success("To'lov sanasi belgilandi");
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["outreach", "stats"] });
      onSuccess();
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi")),
  });

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>To&apos;lov sanasini belgilash</DialogTitle>
      </DialogHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            O&apos;quvchi
          </div>
          <div className="font-medium">
            #{student.id} {student.firstName} {student.lastName}
          </div>
          <div className="text-xs text-red-600">
            Joriy qarz: {formatBalance(student.balance)}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">To&apos;lov sanasi</Label>
          <DatePicker
            value={date}
            onChange={(d) => setDate(d ?? null)}
            minDate={today}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Izoh</Label>
          <Textarea
            placeholder="Masalan: Oyligini olgach 12-iyunda to'layman dedi"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      <DialogFooter className="border-t px-6 py-4">
        <Button variant="outline" onClick={onCancel} disabled={submit.isPending}>
          Bekor qilish
        </Button>
        <Button onClick={() => submit.mutate()} disabled={!canSubmit || submit.isPending}>
          {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Saqlash
        </Button>
      </DialogFooter>
    </>
  );
}
