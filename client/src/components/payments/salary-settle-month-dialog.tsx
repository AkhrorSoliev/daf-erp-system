"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
import { getErrorMessage } from "@/lib/get-error-message";
import { monthLabel } from "./salary-utils";

interface SettleRow {
  paymentId: string;
  userId: number;
  fullName: string;
  branchId: number | null;
  branchName: string | null;
  amount: number;
  status: string;
}
interface PreviewResponse {
  month: string;
  period: { periodStart: string; periodEnd: string };
  rows: SettleRow[];
  total: number;
  branches: { branchId: number; branchName: string }[];
}
interface CashAccount {
  id: string;
  name: string;
  type: "CASH" | "BANK";
  branchId: number | null;
  balance: number;
}

interface Props {
  open: boolean;
  month: string;
  onOpenChange: (open: boolean) => void;
  onSettled: () => void;
}

/** "yyyy-MM-dd" — the API takes a calendar date, not an instant. */
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** How much of the batch leaves one branch's kassa. */
function branchTotal(rows: SettleRow[], branchId: number): number {
  return rows
    .filter((r) => r.branchId === branchId)
    .reduce((s, r) => s + r.amount, 0);
}

/**
 * Confirm a payroll month that was handed over OUTSIDE the system.
 *
 * The row list is deliberately NOT paginated: a confirmation dialog that hides
 * part of what it is confirming works against its own purpose.
 */
export function SettleMonthDialog({
  open,
  month,
  onOpenChange,
  onSettled,
}: Props) {
  const [paidAt, setPaidAt] = useState<Date>(() => new Date());
  // How much left each account, keyed by account id. A branch's payroll is
  // routinely part cash and part card, so this is an amount per account rather
  // than one chosen account per branch.
  const [amountByAccount, setAmountByAccount] = useState<Record<string, string>>(
    {},
  );
  const [typedTotal, setTypedTotal] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["settle-month-preview", month],
    queryFn: () =>
      api
        .get<PreviewResponse>("/salary/payments/settle-month/preview", {
          params: { month },
        })
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
  });

  const { data: accounts } = useQuery({
    queryKey: ["cash-accounts-for-settle"],
    queryFn: () =>
      api.get<{ data: CashAccount[] }>("/cash-accounts").then((r) => r.data.data),
    enabled: open,
    staleTime: 0,
  });

  const total = preview?.total ?? 0;
  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const branches = useMemo(() => preview?.branches ?? [], [preview]);

  const digits = (v: string) => Number(v.replace(/\D/g, "") || 0);

  /** Per branch: what was named across its accounts vs what it owes. */
  const branchState = useMemo(
    () =>
      branches.map((b) => {
        const owed = branchTotal(rows, b.branchId);
        const branchAccounts = (accounts ?? []).filter(
          (a) => a.branchId === b.branchId,
        );
        const named = branchAccounts.reduce(
          (s, a) => s + digits(amountByAccount[a.id] ?? ""),
          0,
        );
        return { ...b, owed, named, remaining: owed - named, branchAccounts };
      }),
    [branches, rows, accounts, amountByAccount],
  );

  // Every branch's named amounts must close exactly, and the retyped digits
  // must equal the total. Typing the sum IS the confirmation: it is the one
  // number the operator has to have read.
  const allBranchesBalanced =
    branchState.length > 0 && branchState.every((b) => b.remaining === 0);
  const totalMatches = typedTotal.replace(/\D/g, "") === String(total);
  const canSubmit =
    allBranchesBalanced && totalMatches && total > 0 && !submitting;

  const periodStart = preview ? new Date(preview.period.periodStart) : undefined;

  const handleSubmit = async () => {
    if (!preview) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ count: number; total: number }>(
        "/salary/payments/settle-month",
        {
          month,
          paidAt: toDateStr(paidAt),
          accounts: branchState.flatMap((b) =>
            b.branchAccounts
              .map((a) => ({
                branchId: b.branchId,
                cashAccountId: a.id,
                amount: digits(amountByAccount[a.id] ?? ""),
              }))
              // An account nobody drew from is not part of the story.
              .filter((a) => a.amount > 0),
          ),
          confirmAmount: total,
        },
      );
      toast.success(
        `${res.data.count} ta oylik to'langan deb belgilandi — ${formatPrice(
          res.data.total,
        )} so'm`,
      );
      onSettled();
      onOpenChange(false);
    } catch (err) {
      toast.error(getErrorMessage(err, "Tasdiqlashda xatolik yuz berdi"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={submitting ? undefined : onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {monthLabel(preview?.month ?? month)} oyligi — to&apos;langanini
            tasdiqlash
          </DialogTitle>
          <DialogDescription>
            Tizimdan tashqarida berilgan oylikni rasmiylashtirish.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Bu oyda to&apos;lanmagan oylik yo&apos;q.
            </p>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  Bu amal qaytarilmaydi. Tizim{" "}
                  <b className="tabular-nums">{formatPrice(total)} so&apos;m</b>ni
                  kassadan chiqim qilib yozadi va {rows.length} ta xodim
                  balansidan ayiradi.
                </span>
              </div>

              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 border-r">#</TableHead>
                      <TableHead>Xodim</TableHead>
                      <TableHead>Filial</TableHead>
                      <TableHead className="text-right">Summa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, i) => (
                      <TableRow key={r.paymentId}>
                        <TableCell className="border-r text-muted-foreground">
                          {i + 1}
                        </TableCell>
                        <TableCell>{r.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {r.branchName ?? "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatPrice(r.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/40 font-semibold">
                      <TableCell className="border-r" />
                      <TableCell colSpan={2}>JAMI</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPrice(total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <Label>Pul qachon berilgan?</Label>
                <DatePicker
                  value={paidAt}
                  onChange={(d) => d && setPaidAt(d)}
                  maxDate={new Date()}
                  minDate={periodStart}
                />
              </div>

              {branchState.map((b) => (
                <div key={b.branchId} className="space-y-2">
                  <Label>
                    {b.branchName} — qaysi hisobdan qancha chiqdi?
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Bir qismi naqd, bir qismi karta bo&apos;lsa — ikkalasiga ham
                    yozing. Yig&apos;indisi {formatPrice(b.owed)} so&apos;m
                    bo&apos;lishi kerak.
                  </p>

                  {b.branchAccounts.map((a) => {
                    const taken = digits(amountByAccount[a.id] ?? "");
                    const after = a.balance - taken;
                    return (
                      <div key={a.id} className="flex items-start gap-3">
                        <div className="min-w-0 flex-1 pt-2">
                          <p className="truncate text-sm">
                            {a.name}{" "}
                            <span className="text-muted-foreground">
                              ({a.type === "CASH" ? "naqd pul" : "bank / karta"})
                            </span>
                          </p>
                          <p
                            className={
                              taken > 0 && after < 0
                                ? "text-xs text-amber-600 dark:text-amber-500"
                                : "text-xs text-muted-foreground"
                            }
                          >
                            Hozir {formatPrice(a.balance)}
                            {taken > 0 && ` → keyin ${formatPrice(after)}`} so&apos;m
                          </p>
                        </div>
                        <Input
                          className="w-40 shrink-0 text-right tabular-nums"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="0"
                          value={amountByAccount[a.id] ?? ""}
                          onChange={(e) =>
                            setAmountByAccount((prev) => ({
                              ...prev,
                              [a.id]: e.target.value,
                            }))
                          }
                        />
                      </div>
                    );
                  })}

                  <p
                    className={
                      b.remaining === 0
                        ? "text-xs font-medium text-emerald-600 dark:text-emerald-500"
                        : "text-xs font-medium text-destructive"
                    }
                  >
                    {b.remaining === 0
                      ? `To'g'ri — jami ${formatPrice(b.named)} so'm`
                      : b.remaining > 0
                        ? `Yana ${formatPrice(b.remaining)} so'm taqsimlanmagan`
                        : `${formatPrice(-b.remaining)} so'm ortiqcha yozilgan`}
                  </p>
                </div>
              ))}

              <div className="space-y-2">
                <Label htmlFor="settle-total">
                  Tasdiqlash uchun jami summani yozing: {total}
                </Label>
                <Input
                  id="settle-total"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={String(total)}
                  value={typedTotal}
                  onChange={(e) => setTypedTotal(e.target.value)}
                />
                {typedTotal.length > 0 && !totalMatches && (
                  <p className="text-xs text-destructive">Summa mos kelmadi</p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
            To&apos;langanini tasdiqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
