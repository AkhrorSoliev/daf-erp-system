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
import { useT } from "@/i18n/context";
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
  const t = useT();
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
      toast.success(t("Ishtirokchi o'chirildi"));
      onDeleted(participant.id);
      close();
    } catch (error) {
      toast.error(getErrorMessage(error, t("O'chirishda xatolik")));
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
          <AlertDialogTitle>{t("Ishtirokchini o'chirish")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "\"{name}\" imtihondan o'chiriladi. Bu amal arxivlash — ma'lumotlar yo'qotilmaydi.",
              {
                name: `${participant?.firstName ?? ""} ${participant?.lastName ?? ""}`.trim(),
              },
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {refundsToBalance && (
          <div className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              {t(
                "Bu ishtirokchi {amount} so'mni o'quvchi balansidan to'lagan. O'chirilganda tizim bu pulni balansga o'zi qaytaradi — naqd bermang.",
                { amount: formatPrice(fee) },
              )}
            </p>
          </div>
        )}

        {needsConfirm && (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>
                {t(
                  "Bu ishtirokchi {amount} so'm to'lagan. O'chirilsa, bu to'lov mock daromadidan chiqadi, qayta ro'yxatdan o'tsa undan yana to'lov so'raladi. Avval pulni odamga qaytaring.",
                  { amount: formatPrice(fee) },
                )}
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 font-medium">
              <Checkbox
                checked={refundAcknowledged}
                onCheckedChange={(v) => setRefundAcknowledged(v === true)}
                disabled={busy}
              />
              {t("Pul odamga qaytarildi")}
            </label>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{t("Bekor qilish")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={busy || !canConfirm}
            variant="destructive"
          >
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("O'chirish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
