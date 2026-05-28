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
import { PriceInput } from "@/components/ui/price-input";
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

  // "Yo'qolgan o'quvchi" write-off — joriy siklda yo'qotgan o'quvchining
  // qarzini chiqarish bilan birga hisobdan chiqarish. All seven write-off
  // props are optional so legacy callers continue to work — when handlers
  // are omitted the write-off block is hidden.
  eligibility?: DebtWriteOffEligibility | null;
  eligibilityLoading?: boolean;
  writeOff?: boolean;
  onWriteOffChange?: (v: boolean) => void;
  writeOffChoice?: WriteOffChoice;
  onWriteOffChoiceChange?: (choice: WriteOffChoice) => void;
  writeOffCustomAmount?: string;
  onWriteOffCustomAmountChange?: (raw: string) => void;
  writeOffReason?: string;
  onWriteOffReasonChange?: (text: string) => void;
}

export type WriteOffChoice = "real" | "jami" | "custom";

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
  writeOffChoice = "real",
  onWriteOffChoiceChange,
  writeOffCustomAmount = "",
  onWriteOffCustomAmountChange,
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
            writeOffChoice={writeOffChoice}
            onWriteOffChoiceChange={onWriteOffChoiceChange!}
            writeOffCustomAmount={writeOffCustomAmount}
            onWriteOffCustomAmountChange={onWriteOffCustomAmountChange!}
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
  writeOffChoice,
  onWriteOffChoiceChange,
  writeOffCustomAmount,
  onWriteOffCustomAmountChange,
  writeOffReason,
  onWriteOffReasonChange,
  disabled,
}: {
  eligibility: DebtWriteOffEligibility;
  writeOff: boolean;
  onWriteOffChange: (v: boolean) => void;
  writeOffChoice: WriteOffChoice;
  onWriteOffChoiceChange: (choice: WriteOffChoice) => void;
  writeOffCustomAmount: string;
  onWriteOffCustomAmountChange: (raw: string) => void;
  writeOffReason: string;
  onWriteOffReasonChange: (text: string) => void;
  disabled: boolean;
}) {
  const d = eligibility.details;
  const balanceClass =
    d.currentBalance < 0 ? "text-destructive" : "text-emerald-600";
  const customAmountNumber = parseInt(
    writeOffCustomAmount.replace(/\D/g, ""),
    10,
  );

  return (
    <div className="space-y-3 rounded-md border border-amber-300 bg-amber-50/50 p-3 dark:bg-amber-950/20">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Qarzni hisobdan chiqarish
          </p>
          <p className="text-xs text-muted-foreground">
            Joriy ({d.lessonPaymentCount} darslik) sikl bo&apos;yicha kelgan va
            kelmagan darslar narxi. Admin qaysi summani hisobdan chiqarishni
            tanlaydi.
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-background/80 p-3 text-xs">
        <div className="grid grid-cols-[1fr_auto] gap-y-1">
          <span className="text-muted-foreground">Sikl raqami:</span>
          <span className="text-right font-medium">#{d.cycleNumber}</span>

          <span className="text-muted-foreground">Bir dars narxi:</span>
          <span className="text-right font-medium">
            {formatBalance(d.perLessonCost)}
          </span>

          <span className="text-muted-foreground">
            Kelgan darslar ({d.cyclePresentCount + d.cycleLateCount} ta):
          </span>
          <span className="text-right font-medium text-emerald-700 dark:text-emerald-400">
            {formatBalance(d.attendedCost)}
          </span>

          <span className="text-muted-foreground">
            Kelmagan darslar ({d.cycleAbsentCount} ta):
          </span>
          <span className="text-right font-medium text-amber-700 dark:text-amber-300">
            {formatBalance(d.absentCost)}
          </span>

          <span className="mt-1 border-t pt-1 text-muted-foreground">
            Joriy balans:
          </span>
          <span
            className={`mt-1 border-t pt-1 text-right font-semibold ${balanceClass}`}
          >
            {formatBalance(d.currentBalance)}
          </span>
        </div>
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
          Qarzni hisobdan chiqarish
        </Label>
      </div>

      {writeOff && (
        <div className="space-y-3 rounded-md border bg-background/60 p-3">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Qancha summani hisobdan chiqarish kerak?
            </Label>
            <PresetOption
              checked={writeOffChoice === "real"}
              onSelect={() => onWriteOffChoiceChange("real")}
              disabled={disabled}
              label="Real qarz"
              hint="Faqat kelmagan darslar narxi"
              amount={d.realDebtAmount}
            />
            <PresetOption
              checked={writeOffChoice === "jami"}
              onSelect={() => onWriteOffChoiceChange("jami")}
              disabled={disabled}
              label="Jami qarz"
              hint="Balansdagi to'liq qarzdorlik"
              amount={d.totalDebtAmount}
            />
            <PresetOption
              checked={writeOffChoice === "custom"}
              onSelect={() => onWriteOffChoiceChange("custom")}
              disabled={disabled}
              label="Boshqa summa"
              hint={`1 — ${formatNumber(d.maxWriteOff)} so'm oralig'ida`}
            >
              {writeOffChoice === "custom" && (
                <div className="mt-2">
                  <PriceInput
                    value={writeOffCustomAmount}
                    onChange={(e) =>
                      onWriteOffCustomAmountChange(e.target.value)
                    }
                    disabled={disabled}
                    placeholder="Summani kiriting"
                  />
                  {writeOffCustomAmount.trim().length > 0 &&
                    (!Number.isFinite(customAmountNumber) ||
                      customAmountNumber < 1 ||
                      customAmountNumber > d.maxWriteOff) && (
                      <p className="mt-1 text-[11px] text-destructive">
                        Summa 1 dan {formatNumber(d.maxWriteOff)} so&apos;m
                        gacha bo&apos;lishi kerak
                      </p>
                    )}
                </div>
              )}
            </PresetOption>
          </div>

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
        </div>
      )}
    </div>
  );
}

function PresetOption({
  checked,
  onSelect,
  disabled,
  label,
  hint,
  amount,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  disabled: boolean;
  label: string;
  hint: string;
  amount?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-md border p-2 transition-colors ${
        checked ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/30" : ""
      }`}
    >
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="radio"
          checked={checked}
          onChange={onSelect}
          disabled={disabled}
          className="mt-1"
        />
        <div className="flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{label}</span>
            {typeof amount === "number" && (
              <span className="text-sm font-semibold tabular-nums">
                {formatBalance(amount)}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </label>
      {children}
    </div>
  );
}

/**
 * Compute the final write-off amount from the choice + custom input. Returns
 * null when no valid amount could be derived (caller should disable submit).
 */
export function resolveWriteOffAmount(
  choice: WriteOffChoice,
  customAmount: string,
  details: DebtWriteOffEligibility["details"],
): number | null {
  if (choice === "real") return details.realDebtAmount;
  if (choice === "jami") return details.totalDebtAmount;
  // custom
  const n = parseInt(customAmount.replace(/\D/g, ""), 10);
  if (!Number.isFinite(n) || n < 1 || n > details.maxWriteOff) return null;
  return n;
}
