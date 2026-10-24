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
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import type { MockExamParticipant } from "./exam-detail-types";
import { pickDefaultBranchId } from "./default-branch";

interface ConvertedStudent {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
}

interface ConvertParticipantDialogProps {
  participant: MockExamParticipant | null;
  /** Imtihon filiali — oynada oldindan shu tanlanadi. */
  examBranchId: number | null;
  onClose: () => void;
  onConverted: (
    participantId: string,
    student: ConvertedStudent,
  ) => void;
}

export function ConvertParticipantDialog({
  participant,
  examBranchId,
  onClose,
  onConverted,
}: ConvertParticipantDialogProps) {
  const t = useT();
  const branches = useBranchSwitcher((s) => s.branches);
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);
  const [branchId, setBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!participant;

  useEffect(() => {
    if (open) {
      // Imtihon filiali, keyin tepadagi tanlov — ro'yxatdagi birinchisi emas:
      // admin sezmay o'quvchini boshqa filialga yozib qo'ymasin.
      const id = pickDefaultBranchId(branches, [
        examBranchId,
        selectedBranch?.id,
      ]);
      setBranchId(id != null ? String(id) : "");
      setSubmitting(false);
    }
  }, [open, branches, examBranchId, selectedBranch]);

  async function handleConfirm() {
    if (!participant) return;
    if (!branchId) {
      toast.error(t("Filialni tanlang"));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<ConvertedStudent>(
        `/mock-exam-participants/${participant.id}/convert`,
        { branchId: Number(branchId) },
      );
      onConverted(participant.id, data);
      toast.success(`✅ ${t("O'quvchi yaratildi: #{id}", { id: data.id })}`);
      onClose();
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          t("Ishtirokchini o'quvchiga aylantirishda xatolik yuz berdi"),
        ),
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
          <DialogTitle>{t("O'quvchiga aylantirish")}</DialogTitle>
          <DialogDescription>
            {t(
              "{name} (ID #{id}) ma'lumotlari asosida yangi DaF o'quvchisi yaratiladi. ID raqami o'zgarmaydi — mock natijalari ham yangi profilga avtomatik bog'lanadi.",
              {
                name: `${participant.firstName} ${participant.lastName}`,
                id: participant.publicId,
              },
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>{t("Filial")}</Label>
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger>
              <SelectValue placeholder={t("Filialni tanlang")} />
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
            {t(
              "Kurs va guruhga yozish keyinroq o'quvchi profilida amalga oshiriladi.",
            )}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
          >
            {t("Bekor qilish")}
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
            {t("Aylantirish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
