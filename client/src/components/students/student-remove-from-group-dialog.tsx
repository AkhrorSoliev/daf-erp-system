"use client";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle } from "lucide-react";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import type { DebtWriteOffEligibility } from "./debt-write-off-types";

interface StudentRemoveFromGroupDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reasons: { id: string; name: string }[] | undefined;
  reasonId: string | null;
  onReasonIdChange: (id: string | null) => void;
  reasonText: string;
  onReasonTextChange: (text: string) => void;
  removing: boolean;
  canSubmit: boolean;
  onConfirm: () => void;

  // "Yo'qolgan o'quvchi" write-off — joriy siklda biror dars qatnashmagan
  // o'quvchining qarzini bir vaqtning o'zida hisobdan chiqarish. All four
  // props are optional so legacy callers that don't yet thread the
  // eligibility query continue to work — when omitted, the write-off
  // block is simply hidden.
  eligibility?: DebtWriteOffEligibility | null;
  eligibilityLoading?: boolean;
  writeOff?: boolean;
  onWriteOffChange?: (v: boolean) => void;
  writeOffReason?: string;
  onWriteOffReasonChange?: (text: string) => void;
}

export function StudentRemoveFromGroupDialog({
  open,
  onOpenChange,
  reasons,
  reasonId,
  onReasonIdChange,
  reasonText,
  onReasonTextChange,
  removing,
  canSubmit,
  onConfirm,
  eligibility,
  eligibilityLoading,
  writeOff = false,
  onWriteOffChange,
  writeOffReason = "",
  onWriteOffReasonChange,
}: StudentRemoveFromGroupDialogProps) {
  const hasConfiguredReasons = (reasons?.length ?? 0) > 0;
  // Hide the write-off block when the caller didn't wire its handlers —
  // legacy callers that don't yet support the flow stay un-changed.
  const writeOffWired = !!onWriteOffChange && !!onWriteOffReasonChange;
  const showWriteOffBlock = writeOffWired && !!eligibility?.eligible;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Guruhdan chiqarish</AlertDialogTitle>
          <AlertDialogDescription>
            {hasConfiguredReasons
              ? "Ketish sababini tanlang"
              : "O'quvchini guruhdan chiqarish sababini kiriting"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hasConfiguredReasons ? (
          <div className="space-y-2">
            <Select
              value={reasonId ?? undefined}
              onValueChange={(v) => onReasonIdChange(v)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sababni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {reasons?.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Qo'shimcha izoh (ixtiyoriy)"
              value={reasonText}
              onChange={(e) => onReasonTextChange(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        ) : (
          <Textarea
            placeholder="Sabab yozing..."
            value={reasonText}
            onChange={(e) => onReasonTextChange(e.target.value)}
            rows={3}
            className="resize-none"
          />
        )}

        {eligibilityLoading && (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        )}

        {showWriteOffBlock && (
          <WriteOffBlock
            eligibility={eligibility!}
            writeOff={writeOff}
            onWriteOffChange={onWriteOffChange!}
            writeOffReason={writeOffReason}
            onWriteOffReasonChange={onWriteOffReasonChange!}
            disabled={removing}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Bekor qilish</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!canSubmit || removing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {removing ? "Chiqarilmoqda..." : "Chiqarish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function WriteOffBlock({
  eligibility,
  writeOff,
  onWriteOffChange,
  writeOffReason,
  onWriteOffReasonChange,
  disabled,
}: {
  eligibility: DebtWriteOffEligibility;
  writeOff: boolean;
  onWriteOffChange: (v: boolean) => void;
  writeOffReason: string;
  onWriteOffReasonChange: (text: string) => void;
  disabled: boolean;
}) {
  const d = eligibility.details;
  const balanceClass =
    d.currentBalance < 0 ? "text-destructive" : "text-emerald-600";

  return (
    <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Joriy siklda yo&apos;qolgan o&apos;quvchi
          </p>
          <p className="text-xs text-muted-foreground">
            Bu o&apos;quvchi joriy ({d.lessonPaymentCount} darslik) siklda biror
            marta darsga kelmagan. Shu sikldan yig&apos;ilgan qarzni hisobdan
            chiqarish mumkin.
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-background/80 p-3 text-xs">
        <div className="grid grid-cols-[1fr_auto] gap-y-1">
          <span className="text-muted-foreground">
            Sikl raqami:
          </span>
          <span className="text-right font-medium">#{d.cycleNumber}</span>

          <span className="text-muted-foreground">Qatnashgan (PRESENT/LATE):</span>
          <span className="text-right font-medium">
            {d.cyclePresentCount + d.cycleLateCount} dars
          </span>

          <span className="text-muted-foreground">Kelmagan (ABSENT):</span>
          <span className="text-right font-medium">
            {d.cycleAbsentCount} dars
          </span>

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

      <div className="flex items-start gap-2">
        <Checkbox
          id="write-off-debt"
          checked={writeOff}
          onCheckedChange={(v) => onWriteOffChange(v === true)}
          disabled={disabled}
          className="mt-0.5"
        />
        <Label
          htmlFor="write-off-debt"
          className="text-sm leading-relaxed cursor-pointer"
        >
          Joriy sikl qarzini ({formatBalance(d.suggestedWriteOff)}) hisobdan
          chiqarish
        </Label>
      </div>

      {writeOff && (
        <div className="space-y-1">
          <Label
            htmlFor="write-off-reason"
            className="text-xs text-muted-foreground"
          >
            Izoh (majburiy, kamida 5 belgi)
          </Label>
          <Textarea
            id="write-off-reason"
            placeholder="Masalan: O'quvchi yo'qolib qoldi, aloqaga chiqmadi..."
            value={writeOffReason}
            onChange={(e) => onWriteOffReasonChange(e.target.value)}
            rows={2}
            className="resize-none"
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
