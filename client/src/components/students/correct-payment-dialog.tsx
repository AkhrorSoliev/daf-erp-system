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
import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { invalidatePaymentsList } from "@/components/payments/list/payments-queries";
import { PAYMENT_METHOD_LABELS } from "./student-profile-tabs-utils";
import { useT } from "@/i18n/context";

export interface CorrectablePayment {
  id: string;
  amount: number;
  method: string;
}

interface CorrectPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: CorrectablePayment | null;
  /** Called after a successful correction with the student's fresh balance and the new payment's id (null when only the method changed: the payment is updated in place). */
  onCorrected: (newBalance: number | null, result: { newPaymentId: string | null }) => void;
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
  const queryClient = useQueryClient();
  const t = useT();
  // A known method code reads in the page language; an unknown one is data and
  // is shown as it came.
  const methodText = (code: string) => {
    const label = PAYMENT_METHOD_LABELS[code];
    return label ? t(label) : code;
  };

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
        sameAmount
          ? t("To'lov usuli o'zgartirildi: {from} → {to}", {
              from: methodText(payment.method),
              to: methodText(method),
            })
          : t("To'lov to'g'rilandi: {from} → {to} so'm", {
              from: formatPrice(payment.amount),
              to: formatPrice(rawAmount),
            }),
      );
      // The open «To'lovlar» page (if any) follows the change at once.
      invalidatePaymentsList(queryClient);
      onCorrected(
        typeof data?.studentBalance === "number" ? data.studentBalance : null,
        { newPaymentId: typeof data?.newPayment?.id === "string" ? data.newPayment.id : null },
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(
        getErrorMessage(err, t("To'lovni to'g'rilashda xatolik yuz berdi")),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const methodLabel = methodText(payment.method);

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("To'lovni to'g'rilash")}</DialogTitle>
          <DialogDescription>
            {t("Noto'g'ri summa yoki to'lov usuli kiritilgan bo'lsa, ularni shu yerda to'g'rilang. Eski to'lov bekor qilinadi va to'g'ri ma'lumotlar bilan qayta qayd etiladi.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">
              {t("Joriy summa ({method})", { method: methodLabel })}
            </span>
            <span className="font-semibold">
              {formatPrice(payment.amount)} {t("so'm")}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="correct-amount">{t("To'g'ri summa")}</Label>
            <PriceInput
              id="correct-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            {rawAmount > 0 && rawAmount < 1000 && (
              <p className="text-xs text-destructive">
                {t("Minimal summa — 1 000 so'm")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="correct-method">{t("To'lov usuli")}</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="correct-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {noChange && (
            <p className="text-xs text-destructive">
              {t("Summa va to'lov usuli o'zgarmadi — kamida bittasini o'zgartiring")}
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="correct-reason">
              {t("Sabab")}{" "}
              {reasonRequired ? (
                <span className="text-destructive">*</span>
              ) : (
                <span className="text-muted-foreground">{t("(ixtiyoriy)")}</span>
              )}
            </Label>
            <Textarea
              id="correct-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Masalan: summa ortiqcha kiritilgan (4 000 000 o'rniga 400 000)")}
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {t("Sabab o'quvchi tarixiga yoziladi va direktorga bildiriladi.")}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            {t("Bekor qilish")}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("To'g'rilash")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
