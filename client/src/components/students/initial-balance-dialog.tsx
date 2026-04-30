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
import { Input } from "@/components/ui/input";
import { PriceInput } from "@/components/ui/price-input";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number;
  studentName: string;
  onSaved: () => void;
}

/**
 * One-shot dialog (CEO only) for entering a student's opening balance when
 * a center transitions to the new finance system. The backend enforces
 * "exactly one INITIAL_BALANCE per student" via a partial unique index;
 * a second call will return 400 with a clear message.
 */
export function InitialBalanceDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onSaved,
}: Props) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setNote("");
    }
  }, [open]);

  const rawAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  const handleSubmit = async () => {
    if (rawAmount < 0) return;
    setSubmitting(true);
    try {
      await api.post(`/students/${studentId}/initial-balance`, {
        amount: rawAmount,
        note: note.trim() || undefined,
      });
      toast.success("Boshlang'ich balans muvaffaqiyatli kiritildi");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Boshlang&apos;ich balans</DialogTitle>
          <DialogDescription>
            {studentName} uchun joriy qoldiq balansni kiriting. Bu
            ma&apos;lumot bir martagina kiritiladi va keyinchalik
            o&apos;zgartirilmaydi — har dars uchun yechilgan summa shu balansdan
            hisoblanadi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="initial-balance-amount">Summa</Label>
            <PriceInput
              id="initial-balance-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="initial-balance-note">
              Izoh{" "}
              <span className="text-muted-foreground text-xs">(ixtiyoriy)</span>
            </Label>
            <Input
              id="initial-balance-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Eski tizimdan o'tkazildi"
              maxLength={500}
              disabled={submitting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || rawAmount < 0}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
