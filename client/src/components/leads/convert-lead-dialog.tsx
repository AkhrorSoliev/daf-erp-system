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
import { useLeadsBoard, type LeadCard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";

export function ConvertLeadDialog() {
  const convertLead = useLeadsUi((s) => s.convertLead);
  const closeConvertLead = useLeadsUi((s) => s.closeConvertLead);
  const applyLeadUpdate = useLeadsBoard((s) => s.applyLeadUpdate);
  const branches = useBranchSwitcher((s) => s.branches);

  const [branchId, setBranchId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!convertLead;

  useEffect(() => {
    if (open) {
      setBranchId("");
      setSubmitting(false);
    }
  }, [open]);

  async function handleConfirm() {
    if (!convertLead) return;
    setSubmitting(true);
    try {
      const { data } = await api.post<{ studentId: number; lead: LeadCard }>(
        `/leads/${convertLead.id}/convert`,
        branchId ? { branchId: Number(branchId) } : {},
      );
      applyLeadUpdate(convertLead.sectionId, data.lead);
      toast.success("Lid o'quvchiga aylantirildi");
      closeConvertLead();
    } catch (error) {
      toast.error(
        getErrorMessage(error, "O'quvchiga aylantirishda xatolik yuz berdi"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeConvertLead()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>O&apos;quvchiga aylantirish</DialogTitle>
          <DialogDescription>
            Lid ma&apos;lumotlari asosida yangi o&apos;quvchi yaratiladi va lid
            &laquo;O&apos;quvchiga aylangan&raquo; holatiga o&apos;tadi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>Filial (ixtiyoriy)</Label>
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
            Filialni keyinroq o&apos;quvchi sahifasida ham belgilash mumkin.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeConvertLead}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Aylantirish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
