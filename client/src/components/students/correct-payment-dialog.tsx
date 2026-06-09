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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [method, setMethod] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever a new payment is targeted or the dialog reopens.
  // Amount and method are pre-filled with the current values so an admin can
  // change just one of them (e.g. fix only the method) without retyping.
  useEffect(() => {
    if (open && payment) {
      setAmount(String(payment.amount));
      setMethod(payment.method);
      setReason("");
      setSubmitting(false);
    }
  }, [open, payment?.id]);

  if (!payment) return null;

  const rawAmount = Number(amount) || 0;
  const trimmedReason = reason.trim();
  const sameAmount = rawAmount === payment.amount;
  const sameMethod = method === payment.method;
  const noChange = sameAmount && sameMethod;
  // A reason is only required when the amount changes. A method-only fix
  // (e.g. CASH → TRANSFER) doesn't move money, so no reason is needed.
  const reasonRequired = !sameAmount;
  const canSubmit =
    rawAmount >= 1000 &&
    (!reasonRequired || trimmedReason.length > 0) &&
    !noChange &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/payments/${payment.id}/correct`, {
        correctAmount: rawAmount,
        method,
        ...(trimmedReason ? { reason: trimmedReason } : {}),
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
          <DialogTitle>To&apos;lovni to&apos;g&apos;rilash</DialogTitle>
          <DialogDescription>
            Noto&apos;g&apos;ri summa yoki to&apos;lov usuli kiritilgan
            bo&apos;lsa, ularni shu yerda to&apos;g&apos;rilang. Eski to&apos;lov
            bekor qilinadi va to&apos;g&apos;ri ma&apos;lumotlar bilan qayta qayd
            etiladi.
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="correct-method">To&apos;lov usuli</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="correct-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {noChange && (
            <p className="text-xs text-destructive">
              Summa va to&apos;lov usuli o&apos;zgarmadi — kamida bittasini
              o&apos;zgartiring
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="correct-reason">
              Sabab{" "}
              {reasonRequired ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground">(ixtiyoriy)</span>
              )}
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
