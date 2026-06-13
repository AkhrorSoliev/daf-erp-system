"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { formatBalance } from "@/lib/format-utils";
import {
  Card,
  CardContent,
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

const TYPE_LABELS: Record<string, string> = {
  INFLOW: "Kirim",
  OUTFLOW: "Chiqim",
  TRANSFER_IN: "O'tkazma (kirim)",
  TRANSFER_OUT: "O'tkazma (chiqim)",
  ADJUSTMENT: "Tuzatish",
};

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CASH: "Kassa",
  BANK: "Bank",
  CARD: "Karta",
};

interface CashFlow {
  period: { start: string; end: string };
  openingBalance: number;
  closingBalance: number;
  netCashFlow: number;
  inflows: { operating: number; total: number };
  outflows: { operating: number; total: number };
  adjustments: number;
  transfersNet: number;
  byType: { type: string; amount: number; count: number }[];
  accounts: {
    id: string;
    name: string;
    type: string;
    branchId: number | null;
    balance: number;
  }[];
}

export function CashFlowClient() {
  const params = useFinancialParams();
  const { data, isLoading } = useQuery({
    queryKey: ["report-cash-flow", params],
    queryFn: () =>
      api.get<CashFlow>("/reports/cash-flow", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pul oqimi hisoboti</h1>
          <p className="text-sm text-muted-foreground">
            Faqat haqiqiy pul kirim/chiqimi (to'lov, xarajat, oylik, qaytarish) — dars
            hisobi bu yerga kirmaydi
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
            <StatCard label="Boshlang'ich qoldiq" value={formatBalance(data.openingBalance)} />
            <StatCard
              label="Kirim"
              value={formatBalance(data.inflows.operating)}
              tone="good"
            />
            <StatCard
              label="Chiqim"
              value={formatBalance(data.outflows.operating)}
              tone="bad"
            />
            <StatCard
              label="Yakuniy qoldiq"
              value={formatBalance(data.closingBalance)}
              hint={`Sof oqim: ${formatBalance(data.netCashFlow)}`}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Oqim turlari bo'yicha</CardTitle>
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
                    {data.byType.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Bu davrda kassa harakati yo'q
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.byType.map((t) => (
                        <TableRow key={t.type}>
                          <TableCell>{TYPE_LABELS[t.type] ?? t.type}</TableCell>
                          <TableCell className="text-right tabular-nums">{t.count}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBalance(t.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kassa hisoblari (joriy qoldiq)</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hisob</TableHead>
                      <TableHead>Turi</TableHead>
                      <TableHead className="text-right">Qoldiq</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.accounts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground">
                          Kassa hisoblari sozlanmagan
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.accounts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.name}</TableCell>
                          <TableCell>{ACCOUNT_TYPE_LABELS[a.type] ?? a.type}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatBalance(a.balance)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
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
