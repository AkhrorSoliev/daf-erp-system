"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { PriceInput } from "@/components/ui/price-input";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface Props {
  kind: "percent" | "monthly" | null;
  userIds: number[];
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Bulk-apply a salary rule to many employees at once. Two flavours:
 *   - "percent" (PERCENTAGE) — typical for teachers, e.g. "30% to all"
 *   - "monthly" (FIXED_MONTHLY) — admins / cashiers / BD
 *
 * Submits one POST /salary/config per user in parallel. Partial failures
 * are surfaced via per-user toasts; the dialog closes only when the whole
 * batch settles. The salary cron and accrual reads pick up new versions
 * from `effectiveFrom` forward, so existing accruals are unaffected.
 */
export function SalaryConfigBulkDialog({ kind, userIds, onClose, onSaved }: Props) {
  const open = !!kind;
  const isPercent = kind === "percent";

  const [value, setValue] = useState<string>("");
  const [percentValue, setPercentValue] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setValue("");
      setPercentValue("");
      setEffectiveFrom(undefined);
      setSubmitting(false);
    }
  }, [open]);

  const numericValue = (() => {
    if (isPercent) {
      const n = parseFloat(percentValue);
      return Number.isFinite(n) ? n : 0;
    }
    return parseInt(value.replace(/\D/g, ""), 10) || 0;
  })();

  const canSubmit =
    !!kind &&
    userIds.length > 0 &&
    numericValue > 0 &&
    (!isPercent || numericValue <= 100);

  const handleSubmit = async () => {
    if (!canSubmit || !kind) return;
    setSubmitting(true);

    const salaryType = isPercent ? "PERCENTAGE" : "FIXED_MONTHLY";
    const effectiveFromIso = effectiveFrom
      ? format(effectiveFrom, "yyyy-MM-dd")
      : undefined;

    const results = await Promise.allSettled(
      userIds.map((userId) =>
        api.post("/salary/config", {
          userId,
          salaryType,
          value: numericValue,
          groupId: null,
          effectiveFrom: effectiveFromIso,
        }),
      ),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - succeeded;

    if (failed === 0) {
      toast.success(`${succeeded} ta xodimga qoida belgilandi`);
    } else if (succeeded > 0) {
      toast(
        `${succeeded} ta saqlandi · ${failed} ta xato. Xatosi bo'lganlarni alohida tekshiring.`,
        { icon: "⚠️" },
      );
    } else {
      const firstReject = results.find(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      toast.error(
        getErrorMessage(firstReject?.reason, "Saqlashda xatolik yuz berdi"),
      );
    }

    setSubmitting(false);
    if (succeeded > 0) onSaved();
    else onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting && !v) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isPercent ? "Foiz qo'yish" : "Oylik qo'yish"}
          </DialogTitle>
          <DialogDescription>
            {userIds.length} ta xodim uchun{" "}
            {isPercent
              ? "har dars narxidan foiz hisoblanadi"
              : "oyiga qattiq summa belgilanadi"}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              {isPercent ? "Foiz qiymati" : "Summa"}
            </Label>
            {isPercent ? (
              <div className="relative">
                <Input
                  placeholder="0"
                  value={percentValue}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    setPercentValue(v);
                  }}
                  inputMode="decimal"
                  className="pr-12"
                  autoFocus
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  %
                </span>
              </div>
            ) : (
              <PriceInput
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Masalan 4 000 000"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Kuchga kirish sanasi (ixtiyoriy)
            </Label>
            <DatePicker
              value={effectiveFrom}
              onChange={setEffectiveFrom}
              disabled={submitting}
              placeholder="Bugundan boshlab"
            />
            <p className="text-xs text-muted-foreground">
              Bu sanadan boshlangan darslar yangi qoida bo&apos;yicha
              hisoblanadi. Avvalgi davrlar avvalgi qoidada qoladi.
            </p>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            ⚠️ Bu {userIds.length} ta xodim uchun mavjud{" "}
            <b>umumiy</b> qoidani bekor qiladi (per-group qoidalar tegmaydi).
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Qo&apos;llash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
