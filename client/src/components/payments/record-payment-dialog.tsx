"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const QUICK_AMOUNTS = [100_000, 200_000, 300_000, 400_000, 500_000, 800_000, 1_000_000];

const methodOptions = [
  { value: "CASH", label: "Naqd" },
  { value: "PAYME", label: "Payme" },
  { value: "CLICK", label: "Click" },
  { value: "UZUM", label: "Uzum" },
  { value: "TRANSFER", label: "Bank o'tkazmasi" },
];

function formatPrice(n: number) {
  return n.toLocaleString("en-US");
}

export function RecordPaymentDialog({ open, onOpenChange, onSuccess }: Props) {
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
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);

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

  const handleSubmit = async () => {
    if (!selectedStudent || rawAmount < 1000) return;
    setSubmitting(true);
    try {
      await api.post("/payments", {
        studentId: selectedStudent.id,
        amount: rawAmount,
        method,
        note: note || undefined,
      });
      toast.success(
        `${formatPrice(rawAmount)} so'm to'lov qayd qilindi`
      );
      onOpenChange(false);
      resetForm();
      onSuccess?.();
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
  };

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits) {
      setAmount(parseInt(digits, 10).toLocaleString("en-US"));
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedStudent(null)}
                disabled={submitting}
              >
                O&apos;zgartirish
              </Button>
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
          </div>

          {/* Method */}
          <div className="space-y-2">
            <Label>To&apos;lov usuli</Label>
            <Select value={method} onValueChange={setMethod}>
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
