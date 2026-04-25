"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface Expense {
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

interface EmployeeOption {
  id: number;
  firstName: string;
  lastName: string;
}

const categoryLabels: Record<string, string> = {
  RENT: "Ijara",
  UTILITIES: "Kommunal",
  SUPPLIES: "Ta'minot",
  MARKETING: "Marketing",
  TEACHER_ADVANCE: "Ustozga avans",
  OTHER: "Boshqa",
};

const paymentMethodLabels: Record<string, string> = {
  CASH: "Naqt",
  CARD: "Karta",
};

export function ExpensesClient() {
  const queryClient = useQueryClient();
  const { selectedBranch } = useBranchSwitcher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [category, setCategory] = useState("OTHER");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD">("CASH");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState<Date | null>(new Date());
  const [relatedUserId, setRelatedUserId] = useState<string>("");

  const isTeacherAdvance = category === "TEACHER_ADVANCE";

  const { data, isLoading } = useQuery({
    queryKey: ["expenses", selectedBranch?.id, refreshKey],
    queryFn: () =>
      api
        .get<{ data: Expense[]; total: number }>("/expenses", {
          params: { pageSize: 50, branchId: selectedBranch?.id },
        })
        .then((r) => r.data),
  });

  // Fetch employees only when the advance category is selected — avoids
  // hitting /users on every expense dialog open.
  const { data: employees } = useQuery({
    queryKey: ["expense-employees"],
    queryFn: () =>
      api
        .get<{ data: EmployeeOption[]; total: number }>("/users", {
          params: { pageSize: 200 },
        })
        .then((r) => r.data.data),
    enabled: isTeacherAdvance,
  });

  const rawAmount = parseInt(amount.replace(/\D/g, ""), 10) || 0;

  const handleSubmit = async () => {
    if (rawAmount < 1 || !description.trim() || !date) return;
    if (isTeacherAdvance && !relatedUserId) return;
    setSubmitting(true);
    try {
      await api.post("/expenses", {
        category,
        paymentMethod,
        amount: rawAmount,
        description: description.trim(),
        date: format(date, "yyyy-MM-dd"),
        branchId: selectedBranch?.id,
        ...(isTeacherAdvance && { relatedUserId: parseInt(relatedUserId, 10) }),
      });
      toast.success("Xarajat qayd qilindi");
      setDialogOpen(false);
      setAmount("");
      setDescription("");
      setCategory("OTHER");
      setPaymentMethod("CASH");
      setDate(new Date());
      setRelatedUserId("");
      setRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Xarajatni saqlashda xatolik");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/expenses/${id}`);
      toast.success("Xarajat o'chirildi");
      setRefreshKey((k) => k + 1);
      queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "O'chirishda xatolik");
    }
  };

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits) {
      setAmount(parseInt(digits, 10).toLocaleString("en-US"));
    } else {
      setAmount("");
    }
  };

  const totalExpenses = data?.data.reduce((s, e) => s + e.amount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Xarajatlar
          </h2>
          <p className="text-sm text-muted-foreground">
            Jami: {formatPrice(totalExpenses)} so&apos;m
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          Xarajat qo&apos;shish
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Hali xarajat qayd qilinmagan
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Kategoriya</TableHead>
              <TableHead>Tavsif</TableHead>
              <TableHead>Summa</TableHead>
              <TableHead>To&apos;lov turi</TableHead>
              <TableHead>Sana</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((e, i) => (
              <TableRow key={e.id}>
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {categoryLabels[e.category] ?? e.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{e.description}</TableCell>
                <TableCell className="text-red-600 font-medium">
                  -{formatPrice(e.amount)} so&apos;m
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {paymentMethodLabels[e.paymentMethod] ?? e.paymentMethod}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(e.date), "dd.MM.yyyy")}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-red-600"
                    onClick={() => handleDelete(e.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!submitting) setDialogOpen(v); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Xarajat qo&apos;shish</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
                  {Object.entries(categoryLabels).map(([k, v]) => (
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
                  {Object.entries(paymentMethodLabels).map(([k, v]) => (
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
                <Select value={relatedUserId} onValueChange={setRelatedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Avans oluvchi xodimni tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {(employees ?? []).map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        #{u.id} {u.firstName} {u.lastName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
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
    </div>
  );
}
