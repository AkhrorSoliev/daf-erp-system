"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PriceInput } from "@/components/ui/price-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";

interface RefundPreview {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  courseName: string;
  paidAmount: number;
  studentBalance: number;
  lessonsCompleted: number;
  totalLessons: number;
  perLessonCost: number;
  attendanceConsumed: number;
  ledgerConsumed: number;
  overDeducted: number;
  previousRefunds: number;
  maxRefundable: number;
  suggestedAmount: number;
  warning: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number;
  studentName: string;
  onSuccess?: () => void;
}

const refundMethods = [
  { value: "CASH", label: "Naqd" },
  { value: "TRANSFER", label: "Bank o'tkazmasi" },
  { value: "PAYME", label: "Payme" },
  { value: "CLICK", label: "Click" },
  { value: "UZUM", label: "Uzum" },
];

export function RefundDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("CASH");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setAmount("");
    setRefundMethod("CASH");
    setReason("");
    setPreview(null);
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    api
      .get<RefundPreview>(`/refunds/preview/${studentId}`)
      .then(({ data }) => setPreview(data))
      .catch((err) => {
        setPreview(null);
        setLoadError(getErrorMessage(err, "Ma'lumotlarni yuklashda xatolik"));
      })
      .finally(() => setLoading(false));
  }, [open, studentId]);

  const rawAmount = parseInt(amount || "0", 10) || 0;
  const overMax = preview ? rawAmount > preview.maxRefundable : false;

  const handleSubmit = async () => {
    if (!preview || rawAmount <= 0 || overMax) return;
    setSubmitting(true);
    try {
      const { data } = await api.post("/refunds/quick", {
        studentId,
        enrollmentId: preview.enrollmentId,
        amount: rawAmount,
        refundMethod,
        reason: reason.trim() || undefined,
      });
      toast.success(
        `${formatPrice(data.approvedAmount ?? data.requestedAmount)} so'm qaytarildi`,
      );
      onOpenChange(false);
      resetForm();
      onSuccess?.();
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
      queryClient.invalidateQueries({ queryKey: ["student-payments"] });
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Pulni qaytarishda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (submitting) return;
        onOpenChange(v);
        if (!v) resetForm();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pulni qaytarish</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border p-3">
            <p className="text-sm font-medium">
              #{studentId} {studentName}
            </p>
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Yuklanmoqda...
            </div>
          )}

          {!loading && loadError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 flex items-start gap-2">
              <AlertCircle className="size-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{loadError}</p>
            </div>
          )}

          {!loading && preview && (
            <>
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Guruh:</span>
                  <span className="font-medium">{preview.groupName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Kurs:</span>
                  <span className="font-medium">{preview.courseName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">To&apos;langan:</span>
                  <span className="font-medium">
                    {formatPrice(preview.paidAmount)} so&apos;m
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    O&apos;tilgan darslar:
                  </span>
                  <span className="font-medium">
                    {preview.lessonsCompleted} / {preview.totalLessons}
                    {preview.perLessonCost > 0 &&
                      ` (${formatPrice(preview.attendanceConsumed)} so'm)`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Hisobidagi balans:
                  </span>
                  <span className="font-medium">
                    {formatPrice(preview.studentBalance)} so&apos;m
                  </span>
                </div>
                {preview.overDeducted > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Foydalanilmagan darslar:
                    </span>
                    <span className="font-medium">
                      {formatPrice(preview.overDeducted)} so&apos;m
                    </span>
                  </div>
                )}
                {preview.previousRefunds > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      Oldingi qaytarishlar:
                    </span>
                    <span className="font-medium">
                      {formatPrice(preview.previousRefunds)} so&apos;m
                    </span>
                  </div>
                )}
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="font-medium">To&apos;liq qaytarish:</span>
                  <span className="text-lg font-bold text-green-600">
                    {formatPrice(preview.maxRefundable)} so&apos;m
                  </span>
                </div>
              </div>

              {preview.warning && (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    {preview.warning}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Qaytarish summasi</Label>
                  {preview.suggestedAmount > 0 &&
                    preview.suggestedAmount !== rawAmount && (
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                        onClick={() =>
                          setAmount(String(preview.suggestedAmount))
                        }
                      >
                        Tavsiya: {formatPrice(preview.suggestedAmount)} so&apos;m
                      </button>
                    )}
                </div>
                <PriceInput
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                {overMax && (
                  <p className="text-xs text-destructive">
                    Maksimum {formatPrice(preview.maxRefundable)} so&apos;m
                    qaytarish mumkin
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Qaytarish usuli</Label>
                <Select value={refundMethod} onValueChange={setRefundMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {refundMethods.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Sabab (ixtiyoriy)</Label>
                <Textarea
                  placeholder="Qaytarish sababi..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={
              !preview || rawAmount <= 0 || overMax || submitting || loading
            }
          >
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Qaytarish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
