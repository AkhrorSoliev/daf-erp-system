"use client";

import { useState, type MouseEvent } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { ContractView } from "./contract-types";

interface Props {
  contract: ContractView | null;
  onClose: () => void;
  onCancelled: (view: ContractView) => void;
}

export function ContractCancelDialog({ contract, onClose, onCancelled }: Props) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = reason.trim().length >= 3;

  const close = () => {
    if (saving) return;
    setReason("");
    onClose();
  };

  const confirm = async (e: MouseEvent) => {
    e.preventDefault();
    if (!contract || !ready) return;
    setSaving(true);
    try {
      const { data } = await api.post<ContractView>(`/contract-documents/${contract.id}/cancel`, {
        reason: reason.trim(),
      });
      toast.success(`Shartnoma ${data.number} bekor qilindi`);
      setReason("");
      onCancelled(data);
    } catch (err) {
      toast.error(getErrorMessage(err, "Shartnomani bekor qilishda xatolik yuz berdi"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AlertDialog open={contract !== null} onOpenChange={(open) => !open && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Shartnoma № {contract?.number} bekor qilinsinmi?</AlertDialogTitle>
          <AlertDialogDescription>
            Shartnomadagi kurslar shartnomasiz bo&apos;lib qoladi va ular uchun yangi shartnoma
            tuzish mumkin bo&apos;ladi. Bekor qilingan shartnoma ro&apos;yxatda qoladi, PDF&apos;i
            «BEKOR QILINGAN» yozuvi bilan chiqadi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="contract-cancel-reason">Sabab</Label>
          <Textarea
            id="contract-cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Ortga</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={!ready || saving}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            Bekor qilish
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
