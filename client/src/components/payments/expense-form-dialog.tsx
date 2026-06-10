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
import {
  EmployeeAdvanceSelect,
  type EmployeeOption,
} from "./employee-advance-select";
import {
  EXPENSE_CATEGORY_LABELS,
  EXPENSE_METHOD_LABELS,
} from "./expenses-filter-bar";

export interface Expense {
  id: string;
  category: string;
  paymentMethod: "CASH" | "CARD";
  amount: number;
  description: string;
  date: string;
  branchId: number | null;
  relatedUserId?: number | null;
  createdAt: string;
  createdBy: { id: number; firstName: string; lastName: string };
}

interface ExpenseFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided the dialog is in edit mode; otherwise it creates. */
  expense?: Expense | null;
  branchId?: number;
  onSaved: () => void;
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expense,
  branchId,
  onSaved,
}: ExpenseFormDialogProps) {
  const isEdit = !!expense;

  const [category, setCategory] = useState("OTHER");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date | null>(new Date());
  const [relatedUserId, setRelatedUserId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const isTeacherAdvance = category === "TEACHER_ADVANCE";

  // Seed the form whenever the dialog opens (edit → existing values, create →
  // sensible defaults). Keyed on open + expense id so re-opening always resets.
  useEffect(() => {
    if (!open) return;
    if (expense) {
      setCategory(expense.category);
      setPaymentMethod(expense.paymentMethod);
      setAmount(expense.amount.toLocaleString("uz-UZ"));
      setDescription(expense.description);
      setDate(new Date(expense.date));
      setRelatedUserId(
        expense.relatedUserId != null ? String(expense.relatedUserId) : "",
      );
    } else {
      setCategory("OTHER");
      setPaymentMethod("CASH");
      setAmount("");
      setDescription("");
      setDate(new Date());
      setRelatedUserId("");
    }
  }, [open, expense]);

  // Employees only loaded for the advance category, and only while the dialog
  // is open — avoids hitting /users on every open. (See expenses-client notes.)
  const { data: employees, isLoading: employeesLoading } = useQuery({
    queryKey: ["expense-employees"],
    queryFn: () =>
      api
        .get<{ data: EmployeeOption[]; total: number }>("/users", {
          params: {
            pageSize: 100,
            user_type: "CEO,Branch Director,Administrator,Teacher",
          },
        })
        .then((r) => r.data.data),
    enabled: open && isTeacherAdvance,
  });

  const rawAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setAmount(digits ? parseInt(digits, 10).toLocaleString("uz-UZ") : "");
  };

  const handleSubmit = async () => {
    if (rawAmount < 1 || !description.trim() || !date) return;
    if (isTeacherAdvance && !relatedUserId) return;
    setSubmitting(true);
    try {
      const payload = {
        category,
        paymentMethod,
        amount: rawAmount,
        description: description.trim(),
        date: format(date, "yyyy-MM-dd"),
        ...(isTeacherAdvance
          ? { relatedUserId: parseInt(relatedUserId, 10) }
          : { relatedUserId: null }),
      };
      if (isEdit) {
        await api.patch(`/expenses/${expense!.id}`, payload);
        toast.success("Xarajat yangilandi");
      } else {
        await api.post("/expenses", { ...payload, branchId });
        toast.success("Xarajat qayd qilindi");
      }
      onOpenChange(false);
      onSaved();
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Xarajatni saqlashda xatolik"));
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
          <DialogTitle>
            {isEdit ? "Xarajatni tahrirlash" : "Xarajat qo'shish"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label>Kategoriya</Label>
            <Select
              value={category}
              onValueChange={(v) => {
                setCategory(v);
                if (v !== "TEACHER_ADVANCE") setRelatedUserId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          {isTeacherAdvance && (
            <div className="space-y-2">
              <Label>Xodim</Label>
              <EmployeeAdvanceSelect
                value={relatedUserId}
                onChange={setRelatedUserId}
                employees={employees ?? []}
                loading={employeesLoading}
              />
              <p className="text-xs text-muted-foreground">
                Avans keyingi oylik hisobida ushbu xodimning oyligidan
                avtomatik ushlab qolinadi
              </p>
            </div>
          )}
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
            <Label>Tavsif</Label>
            <Textarea
              placeholder="Xarajat haqida..."
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
          <Button
            onClick={handleSubmit}
            disabled={
              rawAmount < 1 ||
              !description.trim() ||
              !date ||
              (isTeacherAdvance && !relatedUserId) ||
              submitting
            }
          >
            {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
