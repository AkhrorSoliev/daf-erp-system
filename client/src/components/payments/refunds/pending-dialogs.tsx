"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { formatBalance } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { dayMonth, instantDayMonth } from "../debt/debt-format";
import { accountOptions, cancelConsequence } from "./refunds-format";
import { invalidateRefunds } from "./refunds-queries";
import type { CashAccountOption, PendingRefundRow } from "./refunds-types";

// Fixed header and footer, the body is the only scroll container (dialog scroll-safety rule).
const SHELL = "flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md";

/** «Berildi» (spec §2.3, §3.3): the money leaves the drawer the caller picks — an account of the student's branch. */
export function HandOverDialog({ target, accounts, onClose }: {
  target: PendingRefundRow; accounts: CashAccountOption[]; onClose: () => void;
}) {
  const qc = useQueryClient();
  const options = accountOptions(accounts, target.branchId);
  const [accountId, setAccountId] = useState(options.length === 1 ? options[0].value : "");
  const save = useMutation({
    mutationFn: () => api.post(`/refunds/${target.id}/hand-over`, { cashAccountId: accountId }),
    onSuccess: () => {
      toast.success("Pul berildi");
      invalidateRefunds(qc);
      onClose();
    },
    // A refusal may mean another desk closed the request meanwhile: the list follows the fresh state.
    onError: (e) => {
      toast.error(getErrorMessage(e, "Saqlashda xatolik yuz berdi"));
      invalidateRefunds(qc);
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className={SHELL}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Pul berildi</DialogTitle>
          <DialogDescription>
            {`${target.firstName} ${target.lastName} · so'rov ${instantDayMonth(target.requestedAt)} · muddat ${dayMonth(target.dueDate)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <div className="flex items-center justify-between border-b pb-2 font-medium">
            <span>Berilgan summa</span>
            <span className="tabular-nums">{formatBalance(target.amount)}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ho-account">Qaysi kassadan</Label>
            {options.length === 0 ? (
              <p className="text-destructive">O'quvchining filialida kassa topilmadi</p>
            ) : (
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="ho-account" className="w-full"><SelectValue placeholder="Kassani tanlang" /></SelectTrigger>
                <SelectContent>
                  {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Kassa qoldig'idan shu summa ayiriladi va kvitansiya chiqadi. Sana — bugun.</p>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Yopish</Button>
          <Button onClick={() => save.mutate()} disabled={!accountId || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Berildi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Bekor qilish» (spec §2.4, §3.3): only before the hand-over; the money and the cancelled lessons go back. */
export function CancelRefundDialog({ target, onClose }: { target: PendingRefundRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("");
  const save = useMutation({
    mutationFn: () => api.post(`/refunds/${target.id}/cancel`, { reason: reason.trim() }),
    onSuccess: () => {
      toast.success("So'rov bekor qilindi — pul balansga qaytdi");
      invalidateRefunds(qc);
      onClose();
    },
    onError: (e) => {
      toast.error(getErrorMessage(e, "Bekor qilishda xatolik yuz berdi"));
      invalidateRefunds(qc);
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent className={SHELL}>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>So'rovni bekor qilish</DialogTitle>
          <DialogDescription>{`${target.firstName} ${target.lastName} · ${formatBalance(target.amount)}`}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
          <p>{cancelConsequence(target.amount)}</p>
          <div className="space-y-2">
            <Label htmlFor="rc-reason">Sabab</Label>
            <Textarea id="rc-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500}
              placeholder="Masalan: o'quvchi guruhga qaytdi" />
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>Yopish</Button>
          <Button variant="destructive" onClick={() => save.mutate()} disabled={!reason.trim() || save.isPending}>
            {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Bekor qilish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
