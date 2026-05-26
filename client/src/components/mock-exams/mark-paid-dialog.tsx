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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import type { MockExamParticipant } from "./exam-detail-types";

type Method = "CASH" | "PAYME" | "CLICK";

const METHOD_LABELS: Record<Method, string> = {
  CASH: "Naxt",
  PAYME: "Payme",
  CLICK: "Click",
};

interface MarkPaidDialogProps {
  participant: MockExamParticipant | null;
  examPrice: number;
  onClose: () => void;
  onMarked: (updated: MockExamParticipant) => void;
}

export function MarkPaidDialog({
  participant,
  examPrice,
  onClose,
  onMarked,
}: MarkPaidDialogProps) {
  const [method, setMethod] = useState<Method>("CASH");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (participant) {
      setMethod("CASH");
      setNote("");
      setSubmitting(false);
    }
  }, [participant]);

  async function handleSubmit() {
    if (!participant) return;
    setSubmitting(true);
    try {
      const { data } = await api.post<MockExamParticipant>(
        `/mock-exam-participants/${participant.id}/mark-paid`,
        { method, note: note.trim() || undefined },
      );
      onMarked(data);
      toast.success("To'lov belgilandi");
      onClose();
    } catch (error) {
      toast.error(getErrorMessage(error, "To'lovni belgilashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={!!participant}
      onOpenChange={(o) => !o && !submitting && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>To&apos;lov qabul qilish</DialogTitle>
          <DialogDescription>
            {participant?.firstName} {participant?.lastName} —{" "}
            <span className="font-medium">
              {formatPrice(examPrice)} so&apos;m
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="method">To&apos;lov turi</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as Method)}
              disabled={submitting}
            >
              <SelectTrigger id="method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABELS) as Method[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Izoh (ixtiyoriy)</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: kassaga naxt to'lov, chek raqami..."
              rows={3}
              maxLength={500}
              disabled={submitting}
            />
          </div>
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
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Belgilash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
