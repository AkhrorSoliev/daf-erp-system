"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { adjustmentError, diffText, REASON_MAX } from "./salary-adjustment-model";
import { useInvalidateSalary } from "./salary-queries";
import type { StaffRow } from "./salary-types";

interface Props {
  /** The staff row being corrected; `null` keeps the dialog shut. */
  row: StaffRow | null;
  month: string;
  onClose: () => void;
}

/**
 * «To'g'rilash» (ADR-0112): the CEO's figure for one staff member's pay in one
 * month, with a required reason. Mounted only while a row is picked, so every
 * opening starts from the current figure.
 */
export function SalaryAdjustmentDialog({ row, month, onClose }: Props) {
  if (!row) return null;
  return <AdjustmentForm key={`${row.user.id}-${month}`} row={row} month={month} onClose={onClose} />;
}

function AdjustmentForm({ row, month, onClose }: { row: StaffRow; month: string; onClose: () => void }) {
  const invalidate = useInvalidateSalary();
  const formula = row.calculated ?? row.monthly;
  const [amount, setAmount] = useState(String(row.monthly));
  const [reason, setReason] = useState(row.adjustment?.reason ?? "");
  const [busy, setBusy] = useState<"save" | "revert" | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);

  const value = amount === "" ? null : Number(amount);
  const error = adjustmentError(value, reason);
  const base = `/salary/monthly/user/${row.user.id}/adjustment`;

  const save = async () => {
    if (error || value == null) return;
    setBusy("save");
    try {
      await api.put(base, { month, amount: value, reason: reason.trim() });
      toast.success("Oylik to'g'rilandi");
      // Financial data: refetch, never patch the cache by hand.
      await invalidate();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "To'g'rilashda xatolik yuz berdi"));
    } finally {
      setBusy(null);
    }
  };

  const revert = async () => {
    setBusy("revert");
    try {
      await api.delete(base, { params: { month } });
      toast.success("Oylik hisobga qaytarildi");
      await invalidate();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Hisobga qaytarishda xatolik yuz berdi"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && busy === null && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{`${row.user.firstName} ${row.user.lastName} — oylikni to'g'rilash`}</DialogTitle>
          <DialogDescription>
            Tizim hisobi: {formatPrice(formula)} so&apos;m. Siz kiritgan summa hisobning o&apos;rniga ishlaydi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-amount">Oylik (avansgacha)</Label>
            <PriceInput
              id="adj-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy !== null}
            />
            <p className="min-h-4 text-xs text-muted-foreground">{value == null ? "" : diffText(value, formula)}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adj-reason">Sabab</Label>
            <Input
              id="adj-reason"
              value={reason}
              maxLength={REASON_MAX}
              placeholder="Masalan: oy o'rtasidan ishga kelgan"
              onChange={(e) => setReason(e.target.value)}
              disabled={busy !== null}
            />
          </div>
          {confirmRevert && (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">
              Qo&apos;lda summa o&apos;chadi, oylik {formatPrice(formula)} so&apos;m bo&apos;ladi. Tasdiqlaysizmi?
            </p>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          {row.adjustment &&
            (confirmRevert ? (
              <Button variant="destructive" onClick={revert} disabled={busy !== null}>
                {busy === "revert" && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Ha, hisobga qaytarish
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setConfirmRevert(true)} disabled={busy !== null}>
                Hisobga qaytarish
              </Button>
            ))}
          <Button variant="outline" onClick={onClose} disabled={busy !== null}>
            Bekor qilish
          </Button>
          <Button onClick={save} disabled={!!error || busy !== null}>
            {busy === "save" && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
