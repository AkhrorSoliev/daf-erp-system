"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { dateTimeText } from "./payment-drawer-model";
import type { PaymentRow } from "./payments-list-types";
import { invalidatePaymentsList } from "./payments-queries";

const MAX_REASON = 500;

// Fixed header and footer, the body is the only scroll container (dialog scroll-safety rule).
const SHELL = "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md";

/** The server refuses an empty or a longer-than-500 reason. */
export function canSubmitReason(reason: string): boolean {
  const n = reason.trim().length;
  return n > 0 && n <= MAX_REASON;
}

/** «Bekor qilish» (spec B4 §3.9): the cancelled payment stays in the list; a refusal stays inside the dialog. */
export function ReversePaymentDialog({ row, onClose, onDone }: { row: PaymentRow | null; onClose: () => void; onDone: () => void }) {
  return row ? <ReverseForm key={row.id} row={row} onClose={onClose} onDone={onDone} /> : null;
}

function ReverseForm({ row, onClose, onDone }: { row: PaymentRow; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    // The server rejects an empty body: the reason is always sent, trimmed.
    mutationFn: () => api.post(`/payments/${row.id}/reverse`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success("To'lov bekor qilindi");
      invalidatePaymentsList(qc);
      onDone();
    },
    onError: (e) => setError(getErrorMessage(e, "Bekor qilib bo'lmadi")),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className={SHELL}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>To&apos;lovni bekor qilish</DialogTitle>
          <DialogDescription className="sr-only">Bekor qilish sababini yozing</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <div className="space-y-2">
            <p>
              <strong>{`${row.student.firstName} ${row.student.lastName}`}</strong>
              {` — ${formatPrice(row.amount)} so'm, ${dateTimeText(row.createdAt)}.`}
            </p>
            <p className="text-muted-foreground">
              Pul o&apos;quvchi balansidan olinadi, o&apos;quvchiga Telegram&apos;da xabar boradi. Bekor qilingan to&apos;lov ro&apos;yxatda
              «Bekor qilinganlar» filtrida qoladi.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reverse-reason">Sabab</Label>
            <Textarea
              id="reverse-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setError(null); }}
              rows={3}
              maxLength={MAX_REASON}
              placeholder="Masalan: to'lov xato o'quvchiga yozilgan"
            />
            <p className="text-right text-xs text-muted-foreground tabular-nums">{reason.length} / {MAX_REASON}</p>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Yopish</Button>
          <Button variant="destructive" onClick={() => save.mutate()} disabled={!canSubmitReason(reason) || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Bekor qilish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
