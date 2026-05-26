"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import type { DebtWriteOffEligibility } from "./debt-write-off-types";

interface WriteOffDebtDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: number;
  enrollmentId: string | null;
  groupName: string | null;
  onSuccess?: () => void;
}

/**
 * Standalone "Joriy sikl qarzini hisobdan chiqarish" dialog — used for
 * enrollments that are already DROPPED or FROZEN, where the parent
 * remove-from-group flow doesn't apply (no status flip, just a balance
 * correction). Re-uses the same eligibility endpoint as the integrated
 * checkbox in the remove-from-group modal, so the same business rules
 * apply: balance < 0 AND current cycle PRESENT/LATE = 0 AND ABSENT > 0.
 *
 * On eligibility=false, the dialog explains why and offers no action.
 */
export function WriteOffDebtDialog({
  open,
  onOpenChange,
  studentId,
  enrollmentId,
  groupName,
  onSuccess,
}: WriteOffDebtDialogProps) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset local form state every time the dialog opens for a new enrollment
  // so previous reason text never leaks between rows.
  useEffect(() => {
    if (open) {
      setReason("");
      setSubmitting(false);
    }
  }, [open, enrollmentId]);

  const { data: eligibility, isFetching } = useQuery<DebtWriteOffEligibility>({
    queryKey: ["debt-write-off-eligibility", studentId, enrollmentId],
    queryFn: () =>
      api
        .get<DebtWriteOffEligibility>(
          `/students/${studentId}/enrollments/${enrollmentId}/debt-write-off-eligibility`,
        )
        .then((r) => r.data),
    enabled: open && !!enrollmentId,
    staleTime: 0,
  });

  const trimmedReason = reason.trim();
  const canConfirm =
    !!eligibility?.eligible &&
    trimmedReason.length >= 5 &&
    !submitting;

  const handleConfirm = async () => {
    if (!eligibility?.eligible || !enrollmentId) return;
    setSubmitting(true);
    try {
      await api.post(
        `/students/${studentId}/enrollments/${enrollmentId}/write-off-cycle-debt`,
        {
          reason: trimmedReason,
          confirmAmount: eligibility.details.suggestedWriteOff,
        },
      );
      toast.success("Joriy sikl qarzi hisobdan chiqarildi");
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(
        getErrorMessage(err, "Hisobdan chiqarishda xatolik yuz berdi"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Joriy sikl qarzini hisobdan chiqarish</AlertDialogTitle>
          <AlertDialogDescription>
            {groupName
              ? `Guruh: ${groupName}`
              : "Yopilgan yozuv uchun joriy sikl qarzi tahlili"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isFetching && !eligibility && (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {eligibility && !eligibility.eligible && (
          <IneligibleNotice eligibility={eligibility} />
        )}

        {eligibility?.eligible && (
          <EligibleBlock
            eligibility={eligibility}
            reason={reason}
            onReasonChange={setReason}
            disabled={submitting}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>
            Bekor qilish
          </AlertDialogCancel>
          {eligibility?.eligible && (
            <Button
              onClick={handleConfirm}
              disabled={!canConfirm}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Bajarilmoqda...
                </>
              ) : (
                "Hisobdan chiqarish"
              )}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function IneligibleNotice({
  eligibility,
}: {
  eligibility: DebtWriteOffEligibility;
}) {
  const reasonMessage: Record<string, string> = {
    NO_DEBT: "Bu yozuv uchun balans manfiy emas — hisobdan chiqarishga hojat yo'q.",
    STUDENT_ATTENDED:
      "O'quvchi joriy siklda darslarga qatnashgan — bu yozuv qarzi haqiqiy qarz hisoblanadi.",
    NO_ABSENT_IN_CYCLE:
      "Joriy siklda 'ABSENT' (kelmagan) belgilangan davomat yo'q.",
  };
  return (
    <div className="rounded-md border border-muted-foreground/30 bg-muted/40 p-3 text-sm">
      <p className="font-medium">Hisobdan chiqarish sharti bajarilmadi</p>
      <p className="mt-1 text-muted-foreground">
        {eligibility.reason
          ? reasonMessage[eligibility.reason]
          : "Sharti bajarilmadi."}
      </p>
      <div className="mt-2 text-xs text-muted-foreground">
        Joriy balans: <strong>{formatBalance(eligibility.details.currentBalance)}</strong>
      </div>
    </div>
  );
}

function EligibleBlock({
  eligibility,
  reason,
  onReasonChange,
  disabled,
}: {
  eligibility: DebtWriteOffEligibility;
  reason: string;
  onReasonChange: (v: string) => void;
  disabled: boolean;
}) {
  const d = eligibility.details;
  const balanceClass =
    d.currentBalance < 0 ? "text-destructive" : "text-emerald-600";

  return (
    <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-900 dark:text-amber-200">
          Bu o&apos;quvchi joriy ({d.lessonPaymentCount} darslik) siklda biror
          marta darsga kelmagan.
        </p>
      </div>

      <div className="rounded-md border bg-background/80 p-3 text-xs">
        <div className="grid grid-cols-[1fr_auto] gap-y-1">
          <span className="text-muted-foreground">Sikl raqami:</span>
          <span className="text-right font-medium">#{d.cycleNumber}</span>

          <span className="text-muted-foreground">Qatnashgan (PRESENT/LATE):</span>
          <span className="text-right font-medium">
            {d.cyclePresentCount + d.cycleLateCount} dars
          </span>

          <span className="text-muted-foreground">Kelmagan (ABSENT):</span>
          <span className="text-right font-medium">{d.cycleAbsentCount} dars</span>

          <span className="text-muted-foreground">Bir dars narxi:</span>
          <span className="text-right font-medium">
            {formatBalance(d.perLessonCost)}
          </span>

          <span className="text-muted-foreground">Joriy balans:</span>
          <span className={`text-right font-medium ${balanceClass}`}>
            {formatBalance(d.currentBalance)}
          </span>

          <span className="mt-1 border-t pt-1 text-muted-foreground">
            Hisobdan chiqariladigan summa:
          </span>
          <span className="mt-1 border-t pt-1 text-right font-semibold text-amber-700 dark:text-amber-300">
            {formatBalance(d.suggestedWriteOff)}
          </span>
        </div>
        {d.theoreticalCycleDebt > d.suggestedWriteOff && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Nazariy qarz {formatNumber(d.theoreticalCycleDebt)} so&apos;m, lekin
            joriy balansdan ko&apos;p emas — faqat haqiqiy qarz miqdorida
            chiqariladi.
          </p>
        )}
      </div>

      <div className="space-y-1">
        <Label
          htmlFor="standalone-write-off-reason"
          className="text-xs text-muted-foreground"
        >
          Izoh (majburiy, kamida 5 belgi)
        </Label>
        <Textarea
          id="standalone-write-off-reason"
          placeholder="Masalan: O'quvchi yo'qolib qoldi, aloqaga chiqmadi..."
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={3}
          className="resize-none"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
