"use client";

import { useEffect, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PriceInput } from "@/components/ui/price-input";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { PAYMENT_METHOD_LABELS } from "./student-profile-tabs-utils";

export interface CorrectablePayment {
  id: string;
  amount: number;
  method: string;
}

interface CorrectPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: CorrectablePayment | null;
  /** Called after a successful correction with the student's fresh balance. */
  onCorrected: (newBalance: number | null) => void;
}

export function CorrectPaymentDialog({
  open,
  onOpenChange,
  payment,
  onCorrected,
}: CorrectPaymentDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever a new payment is targeted or the dialog reopens.
  useEffect(() => {
    if (open) {
      setAmount("");
      setReason("");
      setSubmitting(false);
    }
  }, [open, payment?.id]);

  if (!payment) return null;

  const rawAmount = Number(amount) || 0;
  const trimmedReason = reason.trim();
  const sameAmount = rawAmount === payment.amount;
  const canSubmit =
    rawAmount >= 1000 && trimmedReason.length > 0 && !sameAmount && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/payments/${payment.id}/correct`, {
        correctAmount: rawAmount,
        reason: trimmedReason,
      });
      toast.success(
        `To'lov to'g'rilandi: ${formatPrice(payment.amount)} → ${formatPrice(
          rawAmount,
        )} so'm`,
      );
      onCorrected(
        typeof data?.studentBalance === "number" ? data.studentBalance : null,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        getErrorMessage(err, "To'lovni to'g'rilashda xatolik yuz berdi"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const methodLabel =
    PAYMENT_METHOD_LABELS[payment.method] ?? payment.method;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>To&apos;lov summasini to&apos;g&apos;rilash</DialogTitle>
          <DialogDescription>
            Noto&apos;g&apos;ri summa kiritilgan bo&apos;lsa, uni shu yerda
            to&apos;g&apos;rilang. Eski to&apos;lov bekor qilinadi va to&apos;g&apos;ri
            summada qayta qayd etiladi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">
              Joriy summa ({methodLabel})
            </span>
            <span className="font-semibold">
              {formatPrice(payment.amount)} so&apos;m
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="correct-amount">To&apos;g&apos;ri summa</Label>
            <PriceInput
              id="correct-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            {rawAmount > 0 && rawAmount < 1000 && (
              <p className="text-xs text-destructive">
                Minimal summa — 1 000 so&apos;m
              </p>
            )}
            {sameAmount && rawAmount > 0 && (
              <p className="text-xs text-destructive">
                Yangi summa joriy summa bilan bir xil
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="correct-reason">
              Sabab <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="correct-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Masalan: summa ortiqcha kiritilgan (4 000 000 o'rniga 400 000)"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              Sabab o&apos;quvchi tarixiga yoziladi va direktorga bildiriladi.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            To&apos;g&apos;rilash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
