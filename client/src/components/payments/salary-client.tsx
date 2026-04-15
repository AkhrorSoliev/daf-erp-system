"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { CheckCircle, Loader2 } from "lucide-react";
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
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";

function getErrorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

interface SalaryPayment {
  id: string;
  grossAmount: number;
  taxAmount: number;
  netAmount: number;
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

function formatPrice(n: number) {
  return n.toLocaleString("en-US");
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
  const [refreshKey, setRefreshKey] = useState(0);
  const [calculating, setCalculating] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["salary-payments", refreshKey],
    queryFn: () =>
      api
        .get<{ data: SalaryPayment[]; total: number }>("/salary/payments", {
          params: { pageSize: 50 },
        })
        .then((r) => r.data),
  });

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Ish haqi
          </h2>
          <p className="text-sm text-muted-foreground">
            Xodimlar ish haqini boshqarish
          </p>
        </div>
        {isCeo && (
          <Button onClick={handleCalculate} disabled={calculating}>
            {calculating && <Loader2 className="size-4 animate-spin mr-2" />}
            Oylikni hisoblash
          </Button>
        )}
      </div>

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
              <TableHead>Brutto</TableHead>
              <TableHead>Netto</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Amallar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((sp, i) => (
              <TableRow key={sp.id}>
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
                <TableCell>{formatPrice(sp.grossAmount)} so&apos;m</TableCell>
                <TableCell className="font-medium">
                  {formatPrice(sp.netAmount)} so&apos;m
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
                      onClick={() => handleApprove(sp.id)}
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
                      onClick={() => handlePay(sp.id)}
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
    </div>
  );
}
