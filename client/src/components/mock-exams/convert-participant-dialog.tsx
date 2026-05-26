"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { MockExamParticipant } from "./exam-detail-types";

interface ConvertedStudent {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
}

interface ConvertParticipantDialogProps {
  participant: MockExamParticipant | null;
  onClose: () => void;
  onConverted: (
    participantId: string,
    student: ConvertedStudent,
  ) => void;
}

export function ConvertParticipantDialog({
  participant,
  onClose,
  onConverted,
}: ConvertParticipantDialogProps) {
  const branches = useBranchSwitcher((s) => s.branches);
  const [branchId, setBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!participant;

  useEffect(() => {
    if (open) {
      setBranchId(branches[0] ? String(branches[0].id) : "");
      setSubmitting(false);
    }
  }, [open, branches]);

  async function handleConfirm() {
    if (!participant) return;
    if (!branchId) {
      toast.error("Filialni tanlang");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<ConvertedStudent>(
        `/mock-exam-participants/${participant.id}/convert`,
        { branchId: Number(branchId) },
      );
      onConverted(participant.id, data);
      toast.success(`✅ O'quvchi yaratildi: #${data.id}`);
      onClose();
    } catch (error) {
      toast.error(
        getErrorMessage(error, "O'quvchiga aylantirishda xatolik yuz berdi"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!participant) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>O&apos;quvchiga aylantirish</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">
              {participant.firstName} {participant.lastName}
            </span>{" "}
            (ID #{participant.publicId}) ma&apos;lumotlari asosida yangi
            DaF o&apos;quvchisi yaratiladi. ID raqami o&apos;zgarmaydi —
            mock natijalari ham yangi profilga avtomatik bog&apos;lanadi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Filial</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue placeholder="Filialni tanlang" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch) => (
                <SelectItem key={branch.id} value={String(branch.id)}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Kurs va guruhga yozish keyinroq o&apos;quvchi profilida amalga
            oshiriladi.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !branchId}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            Aylantirish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
