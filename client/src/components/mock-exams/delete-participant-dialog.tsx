"use client";

import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import type { MockExamParticipant } from "./exam-detail-types";
import {
  canConfirmDelete,
  deleteRequestParams,
  needsRefundConfirmation,
} from "./participant-delete";
import { participantFee } from "./mock-fee";

interface DeleteParticipantDialogProps {
  participant: MockExamParticipant | null;
  examPrice: number;
  onClose: () => void;
  onDeleted: (id: string) => void;
}

export function DeleteParticipantDialog({
  participant,
  examPrice,
  onClose,
  onDeleted,
}: DeleteParticipantDialogProps) {
  const [busy, setBusy] = useState(false);
  const [refundAcknowledged, setRefundAcknowledged] = useState(false);

  const needsConfirm = participant
    ? needsRefundConfirmation(participant)
    : false;
  const refundsToBalance =
    !!participant?.paid && !!participant?.paidFromBalance;
  const fee = participant ? participantFee(participant, examPrice) : 0;
  const canConfirm =
    participant !== null && canConfirmDelete(participant, refundAcknowledged);

  function close() {
    setRefundAcknowledged(false);
    onClose();
  }

  async function handleDelete(e: React.MouseEvent) {
    // AlertDialogAction bosilganda oyna o'zi yopiladi — so'rov tugaguncha
    // ochiq tursin, xato bo'lsa admin nima bo'lganini ko'rsin.
    e.preventDefault();
    if (!participant || !canConfirm) return;
    setBusy(true);
    try {
      await api.delete(`/mock-exam-participants/${participant.id}`, {
        params: deleteRequestParams(participant, refundAcknowledged),
      });
      toast.success("Ishtirokchi o'chirildi");
      onDeleted(participant.id);
      close();
    } catch (error) {
      toast.error(getErrorMessage(error, "O'chirishda xatolik"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={!!participant}
      onOpenChange={(o) => !o && !busy && close()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ishtirokchini o&apos;chirish</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{participant?.firstName} {participant?.lastName}&quot;
            imtihondan o&apos;chiriladi. Bu amal arxivlash — ma&apos;lumotlar
            yo&apos;qotilmaydi.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {refundsToBalance && (
          <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Bu ishtirokchi{" "}
              <span className="font-semibold tabular-nums">
                {formatPrice(fee)} so&apos;m
              </span>{" "}
              ni o&apos;quvchi balansidan to&apos;lagan. O&apos;chirilganda
              tizim bu pulni balansga o&apos;zi qaytaradi — naqd bermang.
            </p>
          </div>
        )}

        {needsConfirm && (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                Bu ishtirokchi{" "}
                <span className="font-semibold tabular-nums">
                  {formatPrice(fee)} so&apos;m
                </span>{" "}
                to&apos;lagan. O&apos;chirilsa, bu to&apos;lov mock daromadidan
                chiqadi, qayta ro&apos;yxatdan o&apos;tsa undan yana to&apos;lov
                so&apos;raladi. Avval pulni odamga qaytaring.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 font-medium">
              <Checkbox
                checked={refundAcknowledged}
                onCheckedChange={(v) => setRefundAcknowledged(v === true)}
                disabled={busy}
              />
              Pul odamga qaytarildi
            </label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={busy || !canConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            O&apos;chirish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
