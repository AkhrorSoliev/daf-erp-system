"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatBalance, formatPercent } from "@/lib/format-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialFilterBar, useFinancialParams } from "./financial-filter-bar";
import { StatCard } from "./financial-stat-card";

const REVENUE_LABELS: Record<string, string> = {
  TUITION: "O'qish to'lovi",
  REGISTRATION_FEE: "Ro'yxatdan o'tish",
  CERTIFICATE_FEE: "Sertifikat",
  MATERIAL_SALE: "Materiallar",
  MOCK_EXAM_FEE: "Sinov imtihon",
  OTHER: "Boshqa",
};

const EXPENSE_LABELS: Record<string, string> = {
  RENT: "Ijara",
  UTILITIES: "Kommunal",
  SUPPLIES: "Ta'minot",
  MARKETING: "Marketing",
  EQUIPMENT: "Jihozlar",
  MAINTENANCE: "Ta'mirlash",
  TAXES: "Soliqlar",
  TEACHER_ADVANCE: "Ustozga avans",
  OTHER: "Boshqa",
};

interface ProfitLoss {
  period: { start: string; end: string };
  revenue: { total: number; byType: { type: string; amount: number; count: number }[] };
  costOfServices: { teacherSalaries: number; teacherAdvances: number; total: number };
  grossProfit: number;
  operatingExpenses: {
    byCategory: { category: string; amount: number }[];
    adminSalaries: number;
    total: number;
  };
  netProfit: number;
  margins: { grossMarginPercent: number; netMarginPercent: number };
}

export function ProfitLossClient() {
  const params = useFinancialParams();
  const { data, isLoading } = useQuery({
    queryKey: ["report-p-and-l", params],
    queryFn: () =>
      api.get<ProfitLoss>("/reports/p-and-l", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Foyda va zarar hisoboti</h1>
          <p className="text-sm text-muted-foreground">
            Daromad − xizmat tannarxi = yalpi foyda; − operatsion xarajatlar = sof foyda
          </p>
        </div>
        <FinancialFilterBar />
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Daromad" value={formatBalance(data.revenue.total)} />
            <StatCard
              label="Yalpi foyda"
              value={formatBalance(data.grossProfit)}
              hint={`Marja: ${formatPercent(data.margins.grossMarginPercent)}`}
              tone={data.grossProfit >= 0 ? "good" : "bad"}
            />
            <StatCard
              label="Sof foyda"
              value={formatBalance(data.netProfit)}
              hint={`Marja: ${formatPercent(data.margins.netMarginPercent)}`}
              tone={data.netProfit >= 0 ? "good" : "bad"}
            />
            <StatCard
              label="Xizmat tannarxi"
              value={formatBalance(data.costOfServices.total)}
              hint="Ustoz oyligi + avanslar"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daromad (turlari bo'yicha)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tur</TableHead>
                      <TableHead className="text-right">Soni</TableHead>
                      <TableHead className="text-right">Summa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.revenue.byType.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Ma'lumot yo'q
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.revenue.byType.map((r) => (
                        <TableRow key={r.type}>
                          <TableCell>{REVENUE_LABELS[r.type] ?? r.type}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBalance(r.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                    <TableRow className="font-semibold">
                      <TableCell>Jami</TableCell>
                      <TableCell />
                      <TableCell className="text-right tabular-nums">
                        {formatBalance(data.revenue.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Operatsion xarajatlar</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategoriya</TableHead>
                      <TableHead className="text-right">Summa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.operatingExpenses.byCategory.map((e) => (
                      <TableRow key={e.category}>
                        <TableCell>{EXPENSE_LABELS[e.category] ?? e.category}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatBalance(e.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell>Admin oyligi</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBalance(data.operatingExpenses.adminSalaries)}
                      </TableCell>
                    </TableRow>
                    <TableRow className="font-semibold">
                      <TableCell>Jami</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBalance(data.operatingExpenses.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
