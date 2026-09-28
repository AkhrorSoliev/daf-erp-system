"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Ban, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import type { MockExamParticipant } from "./exam-detail-types";
import { participantFee } from "./mock-fee";
import {
  MOCK_PAYMENT_METHODS,
  MOCK_PAYMENT_METHOD_LABELS,
  normalizePaymentNote,
  paymentEditChanged,
  type MockPaymentMethod,
} from "./mock-payment";

interface EditPaymentDialogProps {
  participant: MockExamParticipant | null;
  examPrice: number;
  onClose: () => void;
  onSaved: (updated: MockExamParticipant) => void;
  /** «To'lovni bekor qilish» — tasdiq oynasini ochadi. */
  onRequestCancel: (participant: MockExamParticipant) => void;
}

/**
 * Admin qabul qilgan to'lovni tuzatish: xato tanlangan to'lov turi yoki
 * izoh. Summa o'zgarmaydi — u ro'yxatdan o'tishda qotirilgan narx. To'lov
 * umuman noto'g'ri belgilangan bo'lsa, «To'lovni bekor qilish».
 */
export function EditPaymentDialog({
  participant,
  examPrice,
  onClose,
  onSaved,
  onRequestCancel,
}: EditPaymentDialogProps) {
  const [method, setMethod] = useState<MockPaymentMethod | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (participant) {
      setMethod(participant.paymentMethod);
      setNote(participant.paymentNote ?? "");
      setSubmitting(false);
    }
  }, [participant]);

  const changed = participant
    ? paymentEditChanged(participant, method, note)
    : false;

  async function handleSave() {
    if (!participant || !method || !changed) return;
    setSubmitting(true);
    try {
      const { data } = await api.patch<MockExamParticipant>(
        `/mock-exam-participants/${participant.id}/payment`,
        { method, note: normalizePaymentNote(note) ?? "" },
      );
      onSaved(data);
      toast.success("To'lov ma'lumotlari saqlandi");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "To'lovni saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  }

  const paidBy = participant?.paidBy;

  return (
    <Dialog
      open={!!participant}
      onOpenChange={(o) => !o && !submitting && onClose()}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>To&apos;lovni tahrirlash</DialogTitle>
          <DialogDescription>
            {participant?.firstName} {participant?.lastName} —{" "}
            <span className="font-medium">
              {formatPrice(
                participant ? participantFee(participant, examPrice) : examPrice,
              )}{" "}
              so&apos;m
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            {participant?.paidAt && (
              <p>
                Qabul qilingan:{" "}
                <span className="font-medium text-foreground tabular-nums">
                  {format(new Date(participant.paidAt), "dd.MM.yyyy, HH:mm:ss")}
                </span>
              </p>
            )}
            {paidBy && (
              <p>
                Qabul qildi:{" "}
                <span className="font-medium text-foreground">
                  {paidBy.firstName} {paidBy.lastName}
                </span>
              </p>
            )}
            <p>Summa o&apos;zgarmaydi — u ro&apos;yxatdan o&apos;tishdagi narx.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-payment-method">To&apos;lov turi</Label>
            <Select
              value={method ?? undefined}
              onValueChange={(v) => setMethod(v as MockPaymentMethod)}
              disabled={submitting}
            >
              <SelectTrigger id="edit-payment-method">
                <SelectValue placeholder="To'lov turini tanlang" />
              </SelectTrigger>
              <SelectContent>
                {MOCK_PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {MOCK_PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {participant && !participant.paymentMethod && (
              <p className="text-xs text-muted-foreground">
                Bu to&apos;lovning turi avval saqlanmagan edi — tanlab qo&apos;ying.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-payment-note">Izoh (ixtiyoriy)</Label>
            <Textarea
              id="edit-payment-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: kassaga naqd to'lov, chek raqami..."
              rows={3}
              maxLength={500}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:justify-between">
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={() => participant && onRequestCancel(participant)}
          >
            <Ban className="size-4" />
            To&apos;lovni bekor qilish
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              Yopish
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={submitting || !changed}
            >
              {submitting && <Loader2 className="size-4 animate-spin" />}
              Saqlash
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
