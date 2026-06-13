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
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FinancialFilterBar, useFinancialParams } from "./financial-filter-bar";
import { StatCard } from "./financial-stat-card";

interface BalanceSheet {
  asOf: string;
  assets: {
    cash: number;
    accountsReceivable: number;
    debtorCount: number;
    total: number;
  };
  liabilities: {
    salariesPayable: number;
    deferredRevenue: number;
    prepaidStudentCount: number;
    total: number;
  };
  equity: { retainedEarnings: number; total: number };
  note: string;
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right tabular-nums">{formatBalance(value)}</TableCell>
    </TableRow>
  );
}

export function BalanceSheetClient() {
  // Balance sheet is a current snapshot — no period, but branch scope applies.
  const params = useFinancialParams();
  delete params.startDate;
  delete params.endDate;

  const { data, isLoading } = useQuery({
    queryKey: ["report-balance-sheet", params],
    queryFn: () =>
      api.get<BalanceSheet>("/reports/balance-sheet", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Balans hisoboti</h1>
          <p className="text-sm text-muted-foreground">
            Joriy holat: aktivlar = passivlar + kapital (hosila ko'rsatkich)
          </p>
        </div>
        <FinancialFilterBar withPeriod={false} />
      </div>

      {isLoading || !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Jami aktivlar" value={formatBalance(data.assets.total)} tone="good" />
            <StatCard
              label="Jami passivlar"
              value={formatBalance(data.liabilities.total)}
              tone="bad"
            />
            <StatCard
              label="Kapital"
              value={formatBalance(data.equity.total)}
              tone={data.equity.total >= 0 ? "good" : "bad"}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Aktivlar</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <Row label="Kassa / bank" value={data.assets.cash} />
                    <Row
                      label={`Debitorlik (${data.assets.debtorCount} qarzdor)`}
                      value={data.assets.accountsReceivable}
                    />
                    <TableRow className="font-semibold">
                      <TableCell>Jami</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBalance(data.assets.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Passivlar</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <Row label="Oylik qarzi (ustozlar)" value={data.liabilities.salariesPayable} />
                    <Row
                      label={`Oldindan to'lov (${data.liabilities.prepaidStudentCount} o'quvchi)`}
                      value={data.liabilities.deferredRevenue}
                    />
                    <TableRow className="font-semibold">
                      <TableCell>Jami</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBalance(data.liabilities.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Kapital</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    <Row label="Taqsimlanmagan foyda" value={data.equity.retainedEarnings} />
                    <TableRow className="font-semibold">
                      <TableCell>Jami</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatBalance(data.equity.total)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">{data.note}</p>
        </>
      )}
    </div>
  );
}
