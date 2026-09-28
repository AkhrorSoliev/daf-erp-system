"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import type { MockExamParticipant } from "./exam-detail-types";
import { participantFee } from "./mock-fee";
import { isCancelReasonValid } from "./mock-payment";

interface CancelPaymentDialogProps {
  participant: MockExamParticipant | null;
  examPrice: number;
  onClose: () => void;
  onCancelled: (updated: MockExamParticipant) => void;
}

/**
 * Admin qabul qilgan to'lovni bekor qilish — noto'g'ri odam belgilangan
 * yoki pul qaytarilgan bo'lsa. Ishtirokchi o'chmaydi, faqat yana
 * «to'lanmagan» bo'ladi. Sabab majburiy: u ishtirokchi tarixiga yoziladi.
 */
export function CancelPaymentDialog({
  participant,
  examPrice,
  onClose,
  onCancelled,
}: CancelPaymentDialogProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (participant) {
      setReason("");
      setBusy(false);
    }
  }, [participant]);

  const fee = participant ? participantFee(participant, examPrice) : 0;
  const canConfirm = isCancelReasonValid(reason);

  async function handleConfirm(e: React.MouseEvent) {
    // AlertDialogAction bosilganda oyna o'zi yopiladi — so'rov tugaguncha
    // ochiq tursin, xato bo'lsa admin nima bo'lganini ko'rsin.
    e.preventDefault();
    if (!participant || !canConfirm) return;
    setBusy(true);
    try {
      const { data } = await api.post<MockExamParticipant>(
        `/mock-exam-participants/${participant.id}/cancel-payment`,
        { reason: reason.trim() },
      );
      onCancelled(data);
      toast.success("To'lov bekor qilindi");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "To'lovni bekor qilishda xatolik"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={!!participant}
      onOpenChange={(o) => !o && !busy && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>To&apos;lovni bekor qilasizmi?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{participant?.firstName} {participant?.lastName}&quot;ning{" "}
            <span className="font-semibold tabular-nums">
              {formatPrice(fee)} so&apos;m
            </span>{" "}
            to&apos;lovi bekor qilinadi: ishtirokchi yana «to&apos;lanmagan»
            bo&apos;ladi va bu summa mock daromadidan chiqadi. Ishtirokchi
            ro&apos;yxatdan o&apos;chmaydi.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Pul olingan bo&apos;lsa, uni odamga qaytaring. Faqat turi yoki izohi
            xato bo&apos;lsa, bekor qilmang — «To&apos;lovni tahrirlash»da
            tuzating.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cancel-payment-reason">Sabab</Label>
          <Textarea
            id="cancel-payment-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Masalan: boshqa ishtirokchi o'rniga belgilangan"
            rows={3}
            maxLength={500}
            disabled={busy}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Yopish</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={busy || !canConfirm}
            variant="destructive"
          >
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            To&apos;lovni bekor qilish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
