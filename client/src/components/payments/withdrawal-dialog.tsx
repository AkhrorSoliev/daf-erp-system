"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, AlertCircle } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
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
import { currentMonthKey, monthLabel } from "./salary-utils";
import { invalidateRefunds } from "./refunds/refunds-queries";
import { TransferNote } from "./refunds/transfer-note";
import type { TransferState } from "./refunds/refunds-types";

interface TeacherSuggestion {
  userId: number;
  name: string;
  groupId: string;
  groupName: string;
}

interface WithdrawalPreview {
  studentId: number;
  studentName: string;
  currentBalance: number;
  maxWithdrawable: number;
  teacherSuggestions: TeacherSuggestion[];
  /** Spec B2b §5.2: the transfer condition, shown before anything is typed. */
  transfer: TransferState;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number;
  studentName: string;
  onSuccess?: () => void;
}

export function WithdrawalDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  onSuccess,
}: Props) {
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<WithdrawalPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [creditTeacher, setCreditTeacher] = useState(false);
  const [teacherUserId, setTeacherUserId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Bumped after a notice is given: the preview is read again (it is a plain request, not a React Query key).
  const [previewTick, setPreviewTick] = useState(0);

  const resetForm = useCallback(() => {
    setAmount("");
    setCreditTeacher(false);
    setTeacherUserId("");
    setReason("");
    setPreview(null);
    setLoadError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    api
      .get<WithdrawalPreview>(`/withdrawals/preview/${studentId}`)
      .then(({ data }) => {
        setPreview(data);
        setAmount(String(data.maxWithdrawable));
        if (data.teacherSuggestions.length === 1) {
          setTeacherUserId(String(data.teacherSuggestions[0].userId));
        }
      })
      .catch((err) => {
        setPreview(null);
        setLoadError(getErrorMessage(err, "Ma'lumotlarni yuklashda xatolik"));
      })
      .finally(() => setLoading(false));
  }, [open, studentId, previewTick]);

  // Spec B2b §5.1: without a notice the transfer stays locked, and this dialog is the only place a studying student's notice can be given.
  const giveNotice = useMutation({
    mutationFn: (channel: "BOT" | "CALL") =>
      api.post(`/students/${studentId}/balance-notices`, { channel }),
    onSuccess: (_answer, channel) => {
      toast.success(channel === "BOT" ? "Xabar yuborildi" : "Xabar qayd qilindi");
      invalidateRefunds(queryClient);
      setPreviewTick((n) => n + 1);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Xabarni saqlab bo'lmadi"));
      invalidateRefunds(queryClient);
    },
  });

  const rawAmount = parseInt(amount || "0", 10) || 0;
  const overMax = preview ? rawAmount > preview.maxWithdrawable : false;
  const noBalance = preview ? preview.maxWithdrawable <= 0 : false;
  const locked = preview ? !preview.transfer.allowed : false;

  const teacherOptions = useMemo(() => {
    if (!preview) return [] as TeacherSuggestion[];
    const seen = new Set<number>();
    const out: TeacherSuggestion[] = [];
    for (const t of preview.teacherSuggestions) {
      if (seen.has(t.userId)) continue;
      seen.add(t.userId);
      out.push(t);
    }
    return out;
  }, [preview]);

  const teacherMissing =
    creditTeacher && (!teacherUserId || teacherOptions.length === 0);

  const handleSubmit = async () => {
    if (!preview || rawAmount <= 0 || overMax || teacherMissing || locked) return;
    setSubmitting(true);
    try {
      await api.post("/withdrawals", {
        studentId,
        amount: rawAmount,
        creditTeacher,
        teacherUserId: creditTeacher
          ? parseInt(teacherUserId, 10)
          : undefined,
        reason: reason.trim() || undefined,
      });
      toast.success(
        `${formatPrice(rawAmount)} so'm muvaffaqiyatli yechib olindi`,
      );
      onOpenChange(false);
      resetForm();
      onSuccess?.();
      invalidateRefunds(queryClient);
    } catch (err) {
      toast.error(getErrorMessage(err, "Yechib olishda xatolik yuz berdi"));
      invalidateRefunds(queryClient);
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
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Yechib olish</DialogTitle>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
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
            <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-sm text-destructive">{loadError}</p>
            </div>
          )}

          {!loading && preview && (
            <>
              <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Hozirgi balans:
                  </span>
                  <span className="font-medium">
                    {formatPrice(preview.currentBalance)} so&apos;m
                  </span>
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-medium">Yechilishi mumkin:</span>
                  <span className="text-lg font-bold text-amber-600">
                    {formatPrice(preview.maxWithdrawable)} so&apos;m
                  </span>
                </div>
              </div>

              <TransferNote transfer={preview.transfer} />

              {preview.transfer.notice === null && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={giveNotice.isPending}
                    onClick={() => giveNotice.mutate("BOT")}
                  >
                    Botga xabar yuborish
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={giveNotice.isPending}
                    onClick={() => giveNotice.mutate("CALL")}
                  >
                    Qo&apos;ng&apos;iroq qilib aytildi
                  </Button>
                </div>
              )}

              {noBalance && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    Bu o&apos;quvchining yechib olishga pul mavjud emas.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Yechib olish summasi</Label>
                <PriceInput
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={noBalance || locked}
                />
                {overMax && (
                  <p className="text-xs text-destructive">
                    Maksimum {formatPrice(preview.maxWithdrawable)} so&apos;m
                    yechib olish mumkin
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Bu pul {monthLabel(currentMonthKey())} foydasiga
                  qo&apos;shiladi.
                </p>
              </div>

              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Ustoz balansiga yozilsinmi?
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Ustozning joriy oy oyligiga yoziladi.
                    </p>
                  </div>
                  <Switch
                    checked={creditTeacher}
                    onCheckedChange={setCreditTeacher}
                    disabled={noBalance || locked}
                  />
                </div>
                {creditTeacher && (
                  <div className="mt-3 space-y-2">
                    <Label>Ustoz</Label>
                    {teacherOptions.length === 0 ? (
                      <p className="text-xs text-destructive">
                        O&apos;quvchining faol guruhlarida ustoz topilmadi.
                      </p>
                    ) : (
                      <Select
                        value={teacherUserId}
                        onValueChange={setTeacherUserId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Ustozni tanlang" />
                        </SelectTrigger>
                        <SelectContent>
                          {teacherOptions.map((t) => (
                            <SelectItem
                              key={t.userId}
                              value={String(t.userId)}
                            >
                              {t.name} ({t.groupName})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Sabab (ixtiyoriy)</Label>
                <Textarea
                  placeholder="Yechib olish sababi..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={500}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
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
              !preview ||
              rawAmount <= 0 ||
              overMax ||
              noBalance ||
              locked ||
              teacherMissing ||
              submitting ||
              loading
            }
          >
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            Yechib olish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
