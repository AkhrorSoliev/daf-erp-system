"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Eraser,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  TrendingDown,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { formatBalance, formatNumber } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface DebtWriteOffMetadata {
  reason?: string;
  cycleNumber?: number;
  cycleAbsentCount?: number;
  perLessonCost?: number;
  theoreticalCycleDebt?: number;
  actualWriteOff?: number;
  previousBalance?: number;
  newBalance?: number;
  groupId?: string;
}

interface DebtWriteOffRow {
  id: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description: string | null;
  metadata: DebtWriteOffMetadata | null;
  enrollmentId: string | null;
  branchId: number | null;
  createdAt: string;
  reversedAt: string | null;
  student: { id: number; firstName: string; lastName: string } | null;
  performedBy: { id: number; firstName: string; lastName: string } | null;
}

interface DebtWriteOffsResponse {
  data: DebtWriteOffRow[];
  total: number;
  totalAmount: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];
const REVERSE_REASON_MIN = 5;

export function DebtWriteOffsClient() {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const { selectedBranch } = useBranchSwitcher();
  const queryClient = useQueryClient();

  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [includeReversed, setIncludeReversed] = useState<"active" | "all">(
    "active",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [reverseTarget, setReverseTarget] = useState<DebtWriteOffRow | null>(
    null,
  );
  const [reverseReason, setReverseReason] = useState("");
  const [reversing, setReversing] = useState(false);

  const queryKey = [
    "debt-write-offs",
    selectedBranch?.id ?? null,
    from?.toISOString() ?? null,
    to?.toISOString() ?? null,
    includeReversed,
    page,
    pageSize,
  ];

  const { data, isLoading } = useQuery<DebtWriteOffsResponse>({
    queryKey,
    queryFn: () =>
      api
        .get<DebtWriteOffsResponse>("/transactions/debt-write-offs", {
          params: {
            ...(selectedBranch?.id && { branchId: selectedBranch.id }),
            ...(from && { from: format(from, "yyyy-MM-dd") }),
            ...(to && { to: format(to, "yyyy-MM-dd") }),
            includeReversed: includeReversed === "all" ? "true" : "false",
            page,
            pageSize,
          },
        })
        .then((r) => r.data),
    staleTime: 0,
  });

  const totalAmount = data?.totalAmount ?? 0;
  const totalRows = data?.total ?? 0;

  const handleReverseConfirm = async () => {
    if (!reverseTarget) return;
    if (reverseReason.trim().length < REVERSE_REASON_MIN) return;
    setReversing(true);
    try {
      await api.post(`/billing/debt-write-offs/${reverseTarget.id}/reverse`, {
        reason: reverseReason.trim(),
      });
      toast.success("Hisobdan chiqarish bekor qilindi");
      setReverseTarget(null);
      setReverseReason("");
      queryClient.invalidateQueries({ queryKey: ["debt-write-offs"] });
    } catch (err) {
      toast.error(getErrorMessage(err, "Bekor qilishda xatolik yuz berdi"));
    } finally {
      setReversing(false);
    }
  };

  const resetFilterPage = () => setPage(1);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-semibold tracking-tight">
          Qarz hisobdan chiqarishlar
        </h2>
        <p className="text-sm text-muted-foreground">
          &quot;Yo&apos;qolgan o&apos;quvchi&quot; flow ostida joriy sikldan
          hisobdan chiqarilgan qarzlar jurnali
        </p>
      </header>

      <SummaryCard totalAmount={totalAmount} totalRows={totalRows} />

      <div className="flex flex-wrap items-center gap-2">
        <DatePicker
          value={from}
          onChange={(d) => {
            setFrom(d);
            resetFilterPage();
          }}
          placeholder="Boshlanish"
          className="w-40"
          maxDate={to ?? undefined}
          defaultMonth={to ?? undefined}
        />
        <span className="text-sm text-muted-foreground">—</span>
        <DatePicker
          value={to}
          onChange={(d) => {
            setTo(d);
            resetFilterPage();
          }}
          placeholder="Tugash"
          className="w-40"
          minDate={from ?? undefined}
          defaultMonth={from ?? undefined}
        />
        <Select
          value={includeReversed}
          onValueChange={(v) => {
            setIncludeReversed(v as "active" | "all");
            resetFilterPage();
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Faqat amaldagilar</SelectItem>
            <SelectItem value="all">Hammasi (bekor qilinganlar bilan)</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Sahifa hajmi:
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <DebtWriteOffsTable
        rows={data?.data ?? []}
        isLoading={isLoading}
        page={page}
        pageSize={pageSize}
        isCeo={isCeo}
        onReverseClick={(row) => {
          setReverseTarget(row);
          setReverseReason("");
        }}
      />

      {totalRows > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Jami: {formatNumber(totalRows)} ta yozuv
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Oldingi
            </Button>
            <span className="text-xs">
              {page} / {Math.max(1, Math.ceil(totalRows / pageSize))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= totalRows}
              onClick={() => setPage((p) => p + 1)}
            >
              Keyingi
            </Button>
          </div>
        </div>
      )}

      <ReverseDialog
        target={reverseTarget}
        reason={reverseReason}
        onReasonChange={setReverseReason}
        reversing={reversing}
        onCancel={() => {
          setReverseTarget(null);
          setReverseReason("");
        }}
        onConfirm={handleReverseConfirm}
      />
    </div>
  );
}

function SummaryCard({
  totalAmount,
  totalRows,
}: {
  totalAmount: number;
  totalRows: number;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border bg-amber-50/40 p-4 dark:bg-amber-950/20">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-amber-100 p-2 dark:bg-amber-900/40">
          <TrendingDown className="size-5 text-amber-700 dark:text-amber-300" />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Tanlangan davrda hisobdan chiqarilgan jami
          </p>
          <p className="font-heading text-2xl font-semibold text-amber-700 dark:text-amber-300">
            {formatBalance(totalAmount)}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Operatsiyalar soni
        </p>
        <p className="text-2xl font-medium tabular-nums">
          {formatNumber(totalRows)}
        </p>
      </div>
    </div>
  );
}

function DebtWriteOffsTable({
  rows,
  isLoading,
  page,
  pageSize,
  isCeo,
  onReverseClick,
}: {
  rows: DebtWriteOffRow[];
  isLoading: boolean;
  page: number;
  pageSize: number;
  isCeo: boolean;
  onReverseClick: (row: DebtWriteOffRow) => void;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed py-12 text-center text-sm text-muted-foreground">
        Tanlangan filtrlar bo&apos;yicha hisobdan chiqarishlar topilmadi
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>Sana</TableHead>
          <TableHead>O&apos;quvchi</TableHead>
          <TableHead>Sikl</TableHead>
          <TableHead className="text-right">Summa</TableHead>
          <TableHead>Sabab</TableHead>
          <TableHead>Bajardi</TableHead>
          <TableHead className="w-12" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const isReversed = !!row.reversedAt;
          return (
            <TableRow
              key={row.id}
              className={isReversed ? "opacity-60" : undefined}
            >
              <TableCell className="border-r text-muted-foreground">
                {(page - 1) * pageSize + i + 1}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {format(new Date(row.createdAt), "dd.MM.yyyy, HH:mm")}
              </TableCell>
              <TableCell>
                {row.student ? (
                  <Link
                    href={`/students/profile/${row.student.id}`}
                    className="font-medium hover:underline"
                  >
                    #{row.student.id} {row.student.firstName}{" "}
                    {row.student.lastName}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {row.metadata?.cycleNumber
                  ? `#${row.metadata.cycleNumber} • ${row.metadata.cycleAbsentCount ?? 0} ABS`
                  : "—"}
              </TableCell>
              <TableCell
                className={`text-right tabular-nums font-medium ${isReversed ? "line-through" : "text-amber-700 dark:text-amber-300"}`}
              >
                {formatBalance(row.amount)}
              </TableCell>
              <TableCell className="max-w-[260px] text-sm">
                <p className="line-clamp-2 text-muted-foreground">
                  {row.metadata?.reason ?? row.description ?? "—"}
                </p>
                {isReversed && (
                  <Badge variant="outline" className="mt-1">
                    <RotateCcw className="mr-1 size-3" />
                    Bekor qilingan
                  </Badge>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {row.performedBy
                  ? `${row.performedBy.firstName} ${row.performedBy.lastName}`
                  : "Tizim"}
              </TableCell>
              <TableCell>
                {isCeo && !isReversed ? (
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-xs">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Amallar</span>
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Amallar</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => onReverseClick(row)}
                        className="text-destructive focus:text-destructive"
                      >
                        <RotateCcw className="mr-2 size-4" />
                        Bekor qilish
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ReverseDialog({
  target,
  reason,
  onReasonChange,
  reversing,
  onCancel,
  onConfirm,
}: {
  target: DebtWriteOffRow | null;
  reason: string;
  onReasonChange: (v: string) => void;
  reversing: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const canConfirm = reason.trim().length >= REVERSE_REASON_MIN && !reversing;
  return (
    <AlertDialog
      open={target !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hisobdan chiqarishni bekor qilish</AlertDialogTitle>
          <AlertDialogDescription>
            {target ? (
              <>
                <span className="font-medium text-foreground">
                  {target.student?.firstName} {target.student?.lastName}
                </span>{" "}
                — {formatBalance(target.amount)} qaytariladi va o&apos;quvchi
                balansidan ushbu miqdor qaytadan ayriladi. Bu amal append-only
                ledger qoidalariga muvofiq teskari yozuv sifatida qayd etiladi.
              </>
            ) : (
              "Hisobdan chiqarishni bekor qilasizmi?"
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-1">
          <Label
            htmlFor="reverse-reason"
            className="text-xs text-muted-foreground"
          >
            Bekor qilish sababi (majburiy, kamida 5 belgi)
          </Label>
          <Textarea
            id="reverse-reason"
            placeholder="Masalan: Xato qilindi, qarz haqiqiy edi..."
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            className="resize-none"
            disabled={reversing}
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={reversing}>
            Yopish
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={!canConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {reversing ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Bajarilmoqda...
              </>
            ) : (
              <>
                <Eraser className="mr-2 size-4" />
                Bekor qilish
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
