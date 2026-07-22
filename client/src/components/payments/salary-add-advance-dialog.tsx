"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  EmployeeAdvanceSelect,
  type EmployeeOption,
} from "./employee-advance-select";
import { EXPENSE_METHOD_LABELS } from "./expenses-filter-bar";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bumped after a successful save so the salary table refetches (Avans cell). */
  onSaved: () => void;
}

/**
 * "Avans qo'shish" — records a TEACHER_ADVANCE expense from the Ish haqi page.
 * The advance is still stored as an Expense (so the salary settlement logic is
 * unchanged); it just no longer lives on the Xarajatlar page. The recipient's
 * "Avans" cell in the salary table updates once this saves.
 */
export function SalaryAddAdvanceDialog({ open, onOpenChange, onSaved }: Props) {
  const { selectedBranch } = useBranchSwitcher();

  const [relatedUserId, setRelatedUserId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Avans");
  const [date, setDate] = useState<Date | null>(new Date());
  const [submitting, setSubmitting] = useState(false);

  // Reset to defaults every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setRelatedUserId("");
    setPaymentMethod("CASH");
    setAmount("");
    setDescription("Avans");
    setDate(new Date());
  }, [open]);

  // Staff who can receive an advance — loaded only while the dialog is open.
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ["salary-advance-employees"],
    queryFn: () =>
      api
        .get<{ data: EmployeeOption[]; total: number }>("/users", {
          params: {
            pageSize: 100,
            user_type: "CEO,Branch Director,Administrator,Teacher",
          },
        })
        .then((r) => r.data.data),
    enabled: open,
  });

  const rawAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setAmount(digits ? parseInt(digits, 10).toLocaleString("uz-UZ") : "");
  };

  const canSubmit =
    !!relatedUserId && rawAmount >= 1 && !!description.trim() && !!date;

  const handleSubmit = async () => {
    if (!canSubmit || !date) return;
    setSubmitting(true);
    try {
      await api.post("/expenses", {
        category: "TEACHER_ADVANCE",
        paymentMethod,
        amount: rawAmount,
        description: description.trim(),
        date: format(date, "yyyy-MM-dd"),
        relatedUserId: parseInt(relatedUserId, 10),
        branchId: selectedBranch?.id,
      });
      toast.success("Avans qo'shildi");
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Avansni saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Avans qo&apos;shish</DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label>Xodim</Label>
            <EmployeeAdvanceSelect
              value={relatedUserId}
              onChange={setRelatedUserId}
              employees={employees ?? []}
              loading={employeesLoading}
            />
            <p className="text-xs text-muted-foreground">
              Avans keyingi oylik hisobida ushbu xodimning oyligidan avtomatik
              ushlab qolinadi
            </p>
          </div>
          <div className="space-y-2">
            <Label>To&apos;lov turi</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as "CASH" | "CARD")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_METHOD_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
          </div>
          <div className="space-y-2">
            <Label>Izoh</Label>
            <Textarea
              placeholder="Avans haqida..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Sana</Label>
            <DatePicker
              value={date}
              onChange={(d) => setDate(d ?? null)}
              placeholder="Sanani tanlang"
            />
          </div>
        </div>
        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
