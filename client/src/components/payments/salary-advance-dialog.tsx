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
import type { EditableAdvance } from "./advance-row-actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bumped after a successful save so the salary table refetches (Avans cell). */
  onSaved: () => void;
  /**
   * Dialog ochilganda oldindan qo'yiladigan sana. Avans kalendarida kun tanlab
   * «Bu kunga avans qo'shish» bosilganda o'sha kun keladi. Berilmasa — bugun.
   */
  defaultDate?: Date | null;
  /**
   * Berilsa — tahrirlash rejimi. Xodim o'zgarmaydi (CEO qarori): noto'g'ri
   * odamga yozilgan avans o'chirilib, to'g'ri odamga yangisi yoziladi —
   * shunda tarixda ikkita aniq harakat qoladi.
   */
  advance?: EditableAdvance | null;
}

/**
 * Avans oynasi — ikki rejimda. `advance` berilmasa yangi TEACHER_ADVANCE
 * xarajati yoziladi; berilsa mavjudi tahrirlanadi (summa, sana, naqd/karta,
 * izoh — xodim emas). Bitta oyna, chunki maydonlar, summa formatlash va
 * validatsiya bir xil: ikki nusxa muqarrar ravishda bir-biridan ajralib
 * ketardi. Avans Expense bo'lib saqlanadi, shuning uchun oylik hisobidagi
 * ushlab qolish mantig'i o'zgarmaydi.
 */
export function SalaryAdvanceDialog({
  open,
  onOpenChange,
  onSaved,
  defaultDate,
  advance,
}: Props) {
  const { selectedBranch } = useBranchSwitcher();
  const isEdit = !!advance;

  const [relatedUserId, setRelatedUserId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("Avans");
  const [date, setDate] = useState<Date | null>(new Date());
  const [submitting, setSubmitting] = useState(false);

  // Reset to defaults every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    if (advance) {
      setRelatedUserId("");
      setPaymentMethod(advance.paymentMethod);
      setAmount(advance.amount.toLocaleString("uz-UZ"));
      setDescription(advance.description);
      setDate(new Date(`${advance.date}T00:00:00`));
      return;
    }
    setRelatedUserId("");
    setPaymentMethod("CASH");
    setAmount("");
    setDescription("Avans");
    setDate(defaultDate ?? new Date());
  }, [open, defaultDate, advance]);

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
    enabled: open && !isEdit,
  });

  const rawAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    setAmount(digits ? parseInt(digits, 10).toLocaleString("uz-UZ") : "");
  };

  const canSubmit =
    (isEdit || !!relatedUserId) &&
    rawAmount >= 1 &&
    !!description.trim() &&
    !!date;

  const handleSubmit = async () => {
    if (!canSubmit || !date) return;
    setSubmitting(true);
    try {
      if (advance) {
        // Faqat to'rt maydon. `category`, `relatedUserId` va `branchId`
        // ataylab yuborilmaydi — yuborilmagan maydon o'zgarmaydi, va server
        // avansning xodimini almashtirishni baribir rad etadi.
        await api.patch(`/expenses/${advance.id}`, {
          paymentMethod,
          amount: rawAmount,
          description: description.trim(),
          date: format(date, "yyyy-MM-dd"),
        });
        toast.success("Avans yangilandi");
      } else {
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
      }
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
          <DialogTitle>
            {isEdit ? "Avansni tahrirlash" : "Avans qo'shish"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-2">
            <Label>Xodim</Label>
            {isEdit ? (
              <>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                  {advance?.employeeName}
                </div>
                <p className="text-xs text-muted-foreground">
                  Xodim o&apos;zgarmaydi. Avans boshqa odamga yozilgan
                  bo&apos;lsa — buni o&apos;chirib, to&apos;g&apos;ri xodimga
                  yangi avans yozing.
                </p>
              </>
            ) : (
              <>
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
              </>
            )}
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
            {isEdit && (
              <p className="text-xs text-muted-foreground">
                Sana o&apos;zgarsa avans hisobotlarda yangi kunga ko&apos;chadi,
                Kassa oqimidagi harakat esa kiritilgan kunida qoladi.
              </p>
            )}
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
