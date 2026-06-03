"use client";

import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  Sparkles,
  Wallet,
} from "lucide-react";
import toast from "react-hot-toast";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { formatPrice } from "@/lib/format-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  /** When provided, the student is pre-selected and the search step is skipped. */
  preSelectedStudent?: {
    id: number;
    firstName: string;
    lastName: string;
    balance: number;
  } | null;
  /**
   * Pre-fill the amount input when the caller knows the right value
   * (e.g. opening from the attendance debtors panel: full course price).
   * The user can still edit it before submitting.
   */
  suggestedAmount?: number;
}

const QUICK_AMOUNTS = [100_000, 200_000, 300_000, 400_000, 500_000, 800_000, 1_000_000];

interface PaymentBreakdownItem {
  kind: "DEBT_REPAY" | "CYCLE_FULL" | "CYCLE_PARTIAL" | "REMAINDER";
  amount: number;
  label: string;
  lessons?: number;
  cycleSequenceNumber?: number;
  // DEBT_REPAY uchun — qoplanadigan o'tgan darslar sana oralig'i (ISO).
  // CYCLE_* kelgusi sikllar uchun null (darslar hali o'tilmagan).
  firstLessonDate?: string | null;
  lastLessonDate?: string | null;
}

interface PrimaryEnrollment {
  groupName: string;
  courseName: string;
  perLessonCost: number;
  fullCycleCost: number;
  lessonPaymentCount: number;
  currentPrepaid: number;
  currentCycleSequence: number;
}

interface PaymentPreview {
  amount: number;
  currentBalance: number;
  newBalance: number;
  scenario: "SINGLE_ENROLLMENT" | "MULTI_ENROLLMENT" | "NO_ENROLLMENT";
  primaryEnrollment: PrimaryEnrollment | null;
  breakdown: PaymentBreakdownItem[];
}

interface AmountSuggestions {
  // Recommended amount: covers the debt + tops up the next cycle just enough
  // so the student isn't immediately in debt again.
  recommended: { amount: number; label: string } | null;
  oneFullCycle: { amount: number; label: string };
  twoFullCycles: { amount: number; label: string };
}

function buildAmountSuggestions(
  enr: PrimaryEnrollment,
  currentBalance: number,
): AmountSuggestions {
  const debt = Math.max(0, -currentBalance);
  const recommendedRaw = debt + enr.fullCycleCost;
  return {
    recommended:
      debt > 0
        ? {
            amount: recommendedRaw,
            label: `Qarz + 1 sikl (${enr.lessonPaymentCount} dars)`,
          }
        : {
            amount: enr.fullCycleCost,
            label: `1 to'liq sikl (${enr.lessonPaymentCount} dars)`,
          },
    oneFullCycle: {
      amount: enr.fullCycleCost,
      label: `+1 sikl (${enr.lessonPaymentCount} dars)`,
    },
    twoFullCycles: {
      amount: enr.fullCycleCost * 2,
      label: `+2 sikl (${enr.lessonPaymentCount * 2} dars)`,
    },
  };
}

const methodOptions = [
  { value: "CASH", label: "Naqd" },
  { value: "PAYME", label: "Payme" },
  { value: "CLICK", label: "Click" },
  { value: "UZUM", label: "Uzum" },
  { value: "TRANSFER", label: "Bank o'tkazmasi" },
];

export function RecordPaymentDialog({
  open,
  onOpenChange,
  onSuccess,
  preSelectedStudent,
  suggestedAmount,
}: Props) {
  const queryClient = useQueryClient();
  const { selectedBranch } = useBranchSwitcher();
  const [studentSearch, setStudentSearch] = useState("");
  const [students, setStudents] = useState<
    { id: number; firstName: string; lastName: string; balance: number }[]
  >([]);
  const [selectedStudent, setSelectedStudent] = useState<{
    id: number;
    firstName: string;
    lastName: string;
    balance: number;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [externalId, setExternalId] = useState("");
  const [providerFee, setProviderFee] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);

  // Sync pre-selected student when dialog opens
  useEffect(() => {
    if (open && preSelectedStudent) {
      setSelectedStudent(preSelectedStudent);
    }
  }, [open, preSelectedStudent]);

  // Pre-fill amount only on initial open. Re-syncing on every render would
  // overwrite the user's edits — that's why we key the effect on `open`.
  // Format with uz-UZ thousand separators (matches handleAmountChange) so
  // the input shows e.g. "800 000" instead of bare "800000".
  useEffect(() => {
    if (open && suggestedAmount && suggestedAmount > 0) {
      setAmount(suggestedAmount.toLocaleString("uz-UZ"));
    }
  }, [open, suggestedAmount]);

  // External transaction binding (Payme/Click/Uzum) is only meaningful for
  // non-cash methods. Keep the field hidden for CASH.
  const isOnlineMethod = method !== "CASH";
  const hasExternalId = externalId.trim().length > 0;
  const rawProviderFee = parseInt(providerFee.replace(/\D/g, ""), 10) || 0;

  const searchStudents = useCallback(async (query: string) => {
    if (query.length < 2) {
      setStudents([]);
      return;
    }
    setSearching(true);
    try {
      const { data } = await api.get("/students", {
        params: { search: query, pageSize: 5, status: "active" },
      });
      setStudents(
        data.data.map((s: Record<string, unknown>) => ({
          id: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          balance: s.balance ?? 0,
        }))
      );
    } catch {
      setStudents([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const rawAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  // Debounce the live preview request so we don't fire one query per
  // keystroke. 350ms keeps the breakdown card responsive without hammering
  // the API while the cashier types a multi-digit amount.
  const [debouncedAmount, setDebouncedAmount] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmount(rawAmount), 350);
    return () => clearTimeout(t);
  }, [rawAmount]);

  const previewQuery = useQuery<PaymentPreview>({
    queryKey: ["payment-preview", selectedStudent?.id, debouncedAmount],
    queryFn: () =>
      api
        .get<PaymentPreview>("/payments/preview", {
          params: { studentId: selectedStudent!.id, amount: debouncedAmount },
        })
        .then((r) => r.data),
    enabled: !!selectedStudent && debouncedAmount >= 1000,
    staleTime: 10_000,
  });
  const preview = previewQuery.data;

  // Smart suggestion: "qolgan darslar uchun" — when the primary enrollment has
  // prepaid drained and the next attendance would refill, suggest the partial
  // amount that fits the cycle's remaining lessons exactly. Falls back to
  // perLessonCost × N for cycle-aware refill.
  const suggestion = preview?.primaryEnrollment
    ? buildAmountSuggestions(preview.primaryEnrollment, preview.currentBalance)
    : null;

  const handleSubmit = async () => {
    if (!selectedStudent || rawAmount < 1000) return;
    setSubmitting(true);
    try {
      // If the operator pasted an external transaction id, go through the
      // idempotent attach-external route (backed by the unique constraint on
      // Payment so duplicate binds fail cleanly).
      if (hasExternalId && isOnlineMethod) {
        await api.post("/payments/attach-external", {
          studentId: selectedStudent.id,
          amount: rawAmount,
          method,
          externalId: externalId.trim(),
          ...(rawProviderFee > 0 && { providerFee: rawProviderFee }),
          branchId: selectedBranch?.id,
          note: note || undefined,
        });
      } else {
        await api.post("/payments", {
          studentId: selectedStudent.id,
          amount: rawAmount,
          method,
          branchId: selectedBranch?.id,
          note: note || undefined,
        });
      }
      toast.success(
        `${formatPrice(rawAmount)} so'm to'lov qayd qilindi`
      );
      onOpenChange(false);
      resetForm();
      onSuccess?.();
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
      queryClient.invalidateQueries({ queryKey: ["recent-payments"] });
      queryClient.invalidateQueries({ queryKey: ["student-payments"] });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "To'lovni qayd qilishda xatolik";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStudentSearch("");
    setStudents([]);
    setSelectedStudent(null);
    setAmount("");
    setMethod("CASH");
    setNote("");
    setExternalId("");
    setProviderFee("");
  };

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits) {
      setAmount(parseInt(digits, 10).toLocaleString("uz-UZ"));
    } else {
      setAmount("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!submitting) { onOpenChange(v); if (!v) resetForm(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>To&apos;lov qayd qilish</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Student Search */}
          {!selectedStudent ? (
            <div className="space-y-2">
              <Label>O&apos;quvchi</Label>
              <Input
                placeholder="Ism, telefon yoki ID bo'yicha..."
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  searchStudents(e.target.value);
                }}
              />
              {searching && (
                <p className="text-xs text-muted-foreground">Qidirilmoqda...</p>
              )}
              {students.length > 0 && (
                <div className="border rounded-md max-h-40 overflow-auto">
                  {students.map((s) => (
                    <button
                      key={s.id}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between"
                      onClick={() => {
                        setSelectedStudent(s);
                        setStudents([]);
                        setStudentSearch("");
                      }}
                    >
                      <span>
                        #{s.id} {s.firstName} {s.lastName}
                      </span>
                      <span
                        className={
                          s.balance >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }
                      >
                        {formatPrice(s.balance)} so&apos;m
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">
                  #{selectedStudent.id} {selectedStudent.firstName}{" "}
                  {selectedStudent.lastName}
                </p>
                <p
                  className={`text-xs ${selectedStudent.balance >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  Balans: {formatPrice(selectedStudent.balance)} so&apos;m
                </p>
              </div>
              {!preSelectedStudent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedStudent(null)}
                  disabled={submitting}
                >
                  O&apos;zgartirish
                </Button>
              )}
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label>Summa</Label>
            <div className="relative">
              <Input
                placeholder="0"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                inputMode="numeric"
                className="pr-12"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                so&apos;m
              </span>
            </div>
            {suggestedAmount && suggestedAmount > 0 && (
              <p className="text-xs text-muted-foreground">
                Tavsiya: {formatPrice(suggestedAmount)} so&apos;m — kurs to&apos;liq tsikl narxi
              </p>
            )}

            {/* Smart per-student suggestions powered by /payments/preview.
                Falls back to the static QUICK_AMOUNTS grid when there's no
                primary enrollment (multi-enrollment / no-enrollment cases). */}
            {suggestion ? (
              <div className="flex flex-wrap gap-1.5">
                {suggestion.recommended && (
                  <Button
                    variant={
                      rawAmount === suggestion.recommended.amount
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className="text-xs h-7"
                    onClick={() =>
                      handleAmountChange(String(suggestion.recommended!.amount))
                    }
                  >
                    <Sparkles className="mr-1 size-3" />
                    {suggestion.recommended.label} ·{" "}
                    {formatPrice(suggestion.recommended.amount)}
                  </Button>
                )}
                <Button
                  variant={
                    rawAmount === suggestion.oneFullCycle.amount
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  className="text-xs h-7"
                  onClick={() =>
                    handleAmountChange(String(suggestion.oneFullCycle.amount))
                  }
                >
                  {suggestion.oneFullCycle.label} ·{" "}
                  {formatPrice(suggestion.oneFullCycle.amount)}
                </Button>
                <Button
                  variant={
                    rawAmount === suggestion.twoFullCycles.amount
                      ? "default"
                      : "outline"
                  }
                  size="sm"
                  className="text-xs h-7"
                  onClick={() =>
                    handleAmountChange(String(suggestion.twoFullCycles.amount))
                  }
                >
                  {suggestion.twoFullCycles.label} ·{" "}
                  {formatPrice(suggestion.twoFullCycles.amount)}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((qa) => (
                  <Button
                    key={qa}
                    variant={rawAmount === qa ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => handleAmountChange(String(qa))}
                  >
                    {formatPrice(qa)}
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Live preview: what does this payment buy? */}
          {selectedStudent && rawAmount >= 1000 && (
            <PaymentPreviewCard
              loading={previewQuery.isFetching}
              preview={preview}
            />
          )}

          {/* Method */}
          <div className="space-y-2">
            <Label>To&apos;lov usuli</Label>
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v);
                if (v === "CASH") {
                  setExternalId("");
                  setProviderFee("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methodOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* External transaction binding — only for non-cash methods.
              Filling externalId routes to POST /payments/attach-external,
              which has server-side idempotency via a unique constraint. */}
          {isOnlineMethod && (
            <div className="rounded-md border border-dashed p-3 space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">Tranzaksiyani biriktirish</p>
                <p className="text-[11px] text-muted-foreground">ixtiyoriy</p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Tranzaksiya raqami (externalId)</Label>
                <Input
                  placeholder="Payme/Click/Uzum hisobotidan"
                  value={externalId}
                  onChange={(e) => setExternalId(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Agar to&apos;ldirilsa, ushbu tranzaksiya o&apos;quvchiga biriktiriladi
                  va keyinchalik takroriy biriktirib bo&apos;lmaydi
                </p>
              </div>
              {hasExternalId && (
                <div className="space-y-2">
                  <Label className="text-xs">Provayder komissiyasi</Label>
                  <div className="relative">
                    <Input
                      placeholder="0"
                      value={providerFee}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "");
                        setProviderFee(
                          digits ? parseInt(digits, 10).toLocaleString("uz-UZ") : "",
                        );
                      }}
                      inputMode="numeric"
                      className="pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      so&apos;m
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Note */}
          <div className="space-y-2">
            <Label>Izoh (ixtiyoriy)</Label>
            <Textarea
              placeholder="Qo'shimcha ma'lumot..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => { onOpenChange(false); resetForm(); }}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedStudent || rawAmount < 1000 || submitting}
          >
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            To&apos;lovni qayd qilish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentPreviewCard({
  loading,
  preview,
}: {
  loading: boolean;
  preview: PaymentPreview | undefined;
}) {
  if (!preview) {
    return (
      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        {loading ? "Hisoblanmoqda…" : "Summa kiriting"}
      </div>
    );
  }

  const balanceDelta = preview.newBalance - preview.currentBalance;
  return (
    <div className="rounded-md border bg-card p-3 space-y-3">
      {/* Balance summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Wallet className="size-4" />
          <span>Balans</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono tabular-nums">
          <span
            className={
              preview.currentBalance < 0 ? "text-red-600" : "text-foreground"
            }
          >
            {formatPrice(preview.currentBalance)}
          </span>
          <ArrowRight className="size-3 text-muted-foreground" />
          <span
            className={
              preview.newBalance < 0
                ? "text-red-600 font-semibold"
                : "text-green-600 font-semibold"
            }
          >
            {formatPrice(preview.newBalance)}
          </span>
          <span className="text-muted-foreground">so&apos;m</span>
        </div>
      </div>

      {/* Primary enrollment context */}
      {preview.primaryEnrollment && (
        <div className="rounded-md bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">
            {preview.primaryEnrollment.groupName}
          </span>{" "}
          · {preview.primaryEnrollment.courseName} ·{" "}
          {formatPrice(preview.primaryEnrollment.perLessonCost)} so&apos;m/dars
          {preview.primaryEnrollment.currentPrepaid > 0 && (
            <>
              {" "}
              · oldindan {preview.primaryEnrollment.currentPrepaid} dars
            </>
          )}
        </div>
      )}

      {/* Breakdown */}
      {preview.breakdown.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Bu pul nimaga yetadi:
          </p>
          {preview.breakdown.map((item, idx) => (
            <div
              key={idx}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <div className="flex items-start gap-1.5">
                {item.kind === "DEBT_REPAY" ? (
                  <CircleDollarSign className="mt-0.5 size-3 shrink-0 text-amber-600" />
                ) : item.kind === "REMAINDER" ? (
                  <Wallet className="mt-0.5 size-3 shrink-0 text-slate-500" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-600" />
                )}
                <span>
                  {item.label}
                  {item.firstLessonDate && (
                    <span className="ml-1 text-muted-foreground">
                      ({format(new Date(item.firstLessonDate), "dd.MM")}
                      {item.lastLessonDate &&
                        item.lastLessonDate !== item.firstLessonDate &&
                        ` — ${format(new Date(item.lastLessonDate), "dd.MM")}`}
                      )
                    </span>
                  )}
                </span>
              </div>
              <span className="font-mono tabular-nums">
                {formatPrice(item.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {preview.scenario === "MULTI_ENROLLMENT" && (
        <p className="text-[11px] text-muted-foreground italic">
          O&apos;quvchi 2+ guruhda — qaysi sikl uchun yechilishini sistema
          avtomatik tanlaydi.
        </p>
      )}

      {balanceDelta > 0 && preview.newBalance < 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          ⚠ To&apos;lovdan keyin ham qarz qoladi
        </p>
      )}
    </div>
  );
}
