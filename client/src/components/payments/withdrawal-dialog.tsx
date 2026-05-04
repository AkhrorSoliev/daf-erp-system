"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { MonthPicker } from "@/components/ui/month-picker";
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
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number;
  studentName: string;
  onSuccess?: () => void;
}

function currentMonthString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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
  const [targetMonth, setTargetMonth] = useState(currentMonthString());
  const [creditTeacher, setCreditTeacher] = useState(false);
  const [teacherUserId, setTeacherUserId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resetForm = useCallback(() => {
    setAmount("");
    setTargetMonth(currentMonthString());
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
  }, [open, studentId]);

  const rawAmount = parseInt(amount || "0", 10) || 0;
  const overMax = preview ? rawAmount > preview.maxWithdrawable : false;
  const noBalance = preview ? preview.maxWithdrawable <= 0 : false;

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
    if (!preview || rawAmount <= 0 || overMax || teacherMissing) return;
    setSubmitting(true);
    try {
      await api.post("/withdrawals", {
        studentId,
        amount: rawAmount,
        targetMonth,
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
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
      queryClient.invalidateQueries({ queryKey: ["student-payments"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Yechib olishda xatolik yuz berdi"));
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
          <DialogTitle>Yechib olish</DialogTitle>
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
                  disabled={noBalance}
                />
                {overMax && (
                  <p className="text-xs text-destructive">
                    Maksimum {formatPrice(preview.maxWithdrawable)} so&apos;m
                    yechib olish mumkin
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Qaysi oy uchun</Label>
                <MonthPicker
                  value={targetMonth}
                  onChange={setTargetMonth}
                  disabled={noBalance}
                />
              </div>

              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">
                      Ustoz balansiga yozilsinmi?
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Belgilangan ustozning shu oy uchun oyligiga yoziladi.
                    </p>
                  </div>
                  <Switch
                    checked={creditTeacher}
                    onCheckedChange={setCreditTeacher}
                    disabled={noBalance}
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
              !preview ||
              rawAmount <= 0 ||
              overMax ||
              noBalance ||
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
