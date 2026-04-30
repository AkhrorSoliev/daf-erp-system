"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle, ChevronDown, Loader2, Play, Settings2, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { SalaryConfigDialog } from "./salary-config-dialog";
import { SalaryBreakdownDrawer } from "./salary-breakdown-drawer";
import { SalaryPeriodSettingsSheet } from "./salary-period-settings-sheet";

interface SalaryPayment {
  id: string;
  amount: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  createdAt: string;
  user: {
    id: number;
    firstName: string;
    lastName: string;
    roles: { role: { id: number; name: string } }[];
  };
  paidBy: { id: number; firstName: string; lastName: string } | null;
}

const statusLabels: Record<string, string> = {
  CALCULATED: "Hisoblangan",
  APPROVED: "Tasdiqlangan",
  PAID: "To'langan",
  CANCELLED: "Bekor qilingan",
};

const statusColors: Record<string, string> = {
  CALCULATED: "bg-amber-100 text-amber-800",
  APPROVED: "bg-blue-100 text-blue-800",
  PAID: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};

const roleLabels: Record<number, string> = {
  1: "Direktor",
  2: "Filial direktori",
  3: "Administrator",
  4: "O'qituvchi",
  5: "Kassir",
};

function primaryRoleLabel(roles: { role: { id: number } }[]): string {
  if (!roles.length) return "—";
  const ids = roles.map((r) => r.role.id).sort((a, b) => a - b);
  return roleLabels[ids[0]] ?? "—";
}

export function SalaryClient() {
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const canPay = user?.roles.some((r) => [1, 2].includes(r.id)) ?? false;
  const [refreshKey, setRefreshKey] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [batchPaying, setBatchPaying] = useState(false);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [periodSettingsOpen, setPeriodSettingsOpen] = useState(false);
  const [breakdownPaymentId, setBreakdownPaymentId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["salary-payments", refreshKey],
    queryFn: () =>
      api
        .get<{ data: SalaryPayment[]; total: number }>("/salary/payments", {
          params: { pageSize: 50 },
        })
        .then((r) => r.data),
  });

  const approvedCount = useMemo(
    () => data?.data.filter((sp) => sp.status === "APPROVED").length ?? 0,
    [data],
  );
  const approvedTotal = useMemo(
    () =>
      data?.data
        .filter((sp) => sp.status === "APPROVED")
        .reduce((sum, sp) => sum + sp.amount, 0) ?? 0,
    [data],
  );

  const handleCalculate = async () => {
    setCalculating(true);
    try {
      const { data } = await api.post("/salary/calculate");
      toast.success(`${data.calculated} ta xodim oyligi hisoblandi`);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, "Hisoblashda xatolik"));
    } finally {
      setCalculating(false);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await api.patch(`/salary/payments/${id}/approve`);
      toast.success("Oylik tasdiqlandi");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, "Tasdiqlashda xatolik"));
    } finally {
      setProcessingId(null);
    }
  };

  const handlePay = async (id: string) => {
    setProcessingId(id);
    try {
      await api.post(`/salary/payments/${id}/pay`);
      toast.success("Oylik to'landi");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, "To'lashda xatolik"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleBatchPay = async () => {
    setBatchConfirmOpen(false);
    setBatchPaying(true);
    try {
      const { data: result } = await api.post<{
        total: number;
        paid: number;
        failed: number;
      }>("/salary/payments/batch-pay");
      if (result.failed === 0) {
        toast.success(`${result.paid} ta oylik to'landi`);
      } else {
        toast.success(
          `${result.paid} ta oylik to'landi, ${result.failed} ta xatolik`,
        );
      }
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(getErrorMessage(err, "Batch to'lashda xatolik"));
    } finally {
      setBatchPaying(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Ish haqi
          </h2>
          <p className="text-sm text-muted-foreground">
            Xodimlar ish haqini boshqarish
          </p>
        </div>
        <div className="flex gap-2">
          {canPay && approvedCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    onClick={() => setBatchConfirmOpen(true)}
                    disabled={batchPaying}
                  >
                    {batchPaying ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <Wallet className="size-4 mr-2" />
                    )}
                    Hammasini to&apos;lash ({approvedCount})
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Barcha tasdiqlangan oyliklarni bir martada to&apos;lash (odatda oyning 10-sanasida)
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isCeo && (
            // Recurring monthly action — distinguished from settings by
            // its Play icon and clearer "close the cycle" wording.
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={handleCalculate}
                    disabled={calculating}
                  >
                    {calculating ? (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    ) : (
                      <Play className="size-4 mr-2" />
                    )}
                    Davrni yakunlash
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Joriy davrning oyligini hisoblab chiqaradi va tasdiqlashga jo&apos;natadi
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isCeo && (
            // One-off configuration grouped under a single dropdown so it
            // doesn't blur into the recurring "yakunlash" action above.
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Settings2 className="size-4 mr-2" />
                  Sozlamalar
                  <ChevronDown className="size-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Oylik konfiguratsiyasi</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setConfigDialogOpen(true)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="font-medium">Xodim stavkalari</span>
                  <span className="text-xs text-muted-foreground">
                    Har xodim uchun foiz, fixed yoki o&apos;quvchi boshiga
                  </span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setPeriodSettingsOpen(true)}
                  className="flex flex-col items-start gap-0.5 py-2"
                >
                  <span className="font-medium">Hisoblash davri</span>
                  <span className="text-xs text-muted-foreground">
                    Davr boshlanish kuni (masalan, har oyning 8-kuni)
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <AlertDialog open={batchConfirmOpen} onOpenChange={setBatchConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Barcha tasdiqlangan oyliklarni to&apos;lash</AlertDialogTitle>
            <AlertDialogDescription>
              {approvedCount} ta xodimning oyligi to&apos;lanadi. Jami summa:{" "}
              <strong>{formatPrice(approvedTotal)} so&apos;m</strong>. Bu amal
              bekor qilib bo&apos;lmaydi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchPaying}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchPay} disabled={batchPaying}>
              Ha, to&apos;lash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Hali oylik hisoblash amalga oshirilmagan
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Xodim</TableHead>
              <TableHead>Lavozim</TableHead>
              <TableHead>Davr</TableHead>
              <TableHead>Summa</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((sp, i) => (
              <TableRow
                key={sp.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setBreakdownPaymentId(sp.id)}
              >
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell className="font-medium">
                  #{sp.user.id} {sp.user.firstName} {sp.user.lastName}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {primaryRoleLabel(sp.user.roles)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(sp.periodStart), "dd.MM")} —{" "}
                  {format(new Date(sp.periodEnd), "dd.MM.yyyy")}
                </TableCell>
                <TableCell className="font-medium">
                  {formatPrice(sp.amount)} so&apos;m
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={statusColors[sp.status]}>
                    {statusLabels[sp.status] ?? sp.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {sp.status === "CALCULATED" && isCeo && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(sp.id);
                      }}
                      disabled={processingId === sp.id}
                    >
                      {processingId === sp.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Tasdiqlash"
                      )}
                    </Button>
                  )}
                  {sp.status === "APPROVED" && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePay(sp.id);
                      }}
                      disabled={processingId === sp.id}
                    >
                      {processingId === sp.id ? (
                        <Loader2 className="size-3 animate-spin mr-1" />
                      ) : (
                        <CheckCircle className="size-3 mr-1" />
                      )}
                      To&apos;lash
                    </Button>
                  )}
                  {sp.status === "PAID" && sp.paidAt && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(sp.paidAt), "dd.MM.yyyy")}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SalaryConfigDialog
        open={configDialogOpen}
        onOpenChange={setConfigDialogOpen}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />
      <SalaryBreakdownDrawer
        salaryPaymentId={breakdownPaymentId}
        onClose={() => setBreakdownPaymentId(null)}
      />
      {isCeo && (
        <SalaryPeriodSettingsSheet
          open={periodSettingsOpen}
          onOpenChange={setPeriodSettingsOpen}
        />
      )}
    </div>
  );
}
