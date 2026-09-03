"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { MoreHorizontal, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { formatBalance } from "@/lib/format-utils";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { TablePagination } from "@/components/outreach/table-pagination";
import { WithdrawalDialog } from "../withdrawal-dialog";
import { RefundDialog } from "../refund-dialog";
import { useDebtFilters } from "./debt-filters-provider";

interface FrozenBalanceRow {
  studentId: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  frozenAt: string;
  daysFrozen: number;
  lastPaymentAt: string | null;
}

interface FrozenBalancesResponse {
  data: FrozenBalanceRow[];
  total: number;
  page: number;
  pageSize: number;
}

type ActionTarget = { id: number; name: string };

/**
 * "Muzlatilgan puli": frozen students still holding a positive balance 30+
 * days after they froze. Freezing refunds the rest of the paid month to the
 * student's balance immediately — that money then sits untouched, invisible
 * to everyone, until someone either hands it back or moves it to the
 * center's account. This tab is that work list.
 *
 * Live-computed on the server (`GET /payments/frozen-balances`), same branch
 * scope and role gate as `/payments/debtors` — no cron, no cached table, so
 * a student frozen five minutes ago already ages toward this list correctly
 * even though it will not show for another 30 days.
 *
 * Both row actions reuse the center's existing money dialogs unchanged —
 * this tab writes no new money flow of its own.
 */
export function FrozenBalanceView() {
  const { selectedBranch } = useBranchSwitcher();
  const queryClient = useQueryClient();
  const { filters, setFilter, setFilters } = useDebtFilters();

  const [withdrawalTarget, setWithdrawalTarget] =
    useState<ActionTarget | null>(null);
  const [refundTarget, setRefundTarget] = useState<ActionTarget | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: [
      "frozen-balances",
      selectedBranch?.id,
      filters.page,
      filters.pageSize,
    ],
    queryFn: () =>
      api
        .get<FrozenBalancesResponse>("/payments/frozen-balances", {
          params: {
            branchId: selectedBranch?.id,
            page: filters.page,
            pageSize: filters.pageSize,
          },
        })
        .then((r) => r.data),
  });

  const rows = data?.data ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["frozen-balances"] });
    queryClient.invalidateQueries({ queryKey: ["financial-overview"] });
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Muzlatilgan va balansi hali musbat bo&apos;lgan o&apos;quvchilar —
        muzlatilganiga 30 kundan ortiq bo&apos;lganlar
        {selectedBranch ? ` · ${selectedBranch.name}` : ""}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Wallet className="size-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            Muzlatilgan, puli qolgan o&apos;quvchi yo&apos;q
          </p>
          <p className="max-w-md text-sm text-muted-foreground">
            30 kundan ortiq muzlatilgan holatda turgan va balansida hali
            pul qolgan o&apos;quvchi topilmadi — bunday holat paydo bo&apos;lsa,
            shu yerda ko&apos;rinadi.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>O&apos;quvchi</TableHead>
                  <TableHead>Muzlatilgan</TableHead>
                  <TableHead className="text-right">Balansi</TableHead>
                  <TableHead>Oxirgi to&apos;lov</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => {
                  const name = `${row.firstName} ${row.lastName}`;
                  return (
                    <TableRow key={row.studentId}>
                      <TableCell className="border-r text-muted-foreground">
                        {(filters.page - 1) * filters.pageSize + i + 1}
                      </TableCell>
                      <TableCell className="font-medium">
                        <Link
                          href={`/students/profile/${row.studentId}`}
                          className="hover:underline"
                        >
                          {name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          #{row.studentId}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        <div>{format(new Date(row.frozenAt), "dd.MM.yyyy")}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.daysFrozen} kun
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatBalance(row.balance)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.lastPaymentAt
                          ? format(new Date(row.lastPaymentAt), "dd.MM.yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Amallar</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                setWithdrawalTarget({
                                  id: row.studentId,
                                  name,
                                })
                              }
                            >
                              Markaz hisobiga o&apos;tkazish
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setRefundTarget({ id: row.studentId, name })
                              }
                            >
                              O&apos;quvchiga qaytarish
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <TablePagination
            total={data?.total ?? 0}
            page={filters.page}
            pageSize={filters.pageSize}
            onPageChange={(p) => setFilter("page", p)}
            onPageSizeChange={(s) => setFilters({ pageSize: s, page: 1 })}
          />
        </>
      )}

      {withdrawalTarget && (
        <WithdrawalDialog
          open={!!withdrawalTarget}
          onOpenChange={(open) => !open && setWithdrawalTarget(null)}
          studentId={withdrawalTarget.id}
          studentName={withdrawalTarget.name}
          onSuccess={refresh}
        />
      )}
      {refundTarget && (
        <RefundDialog
          open={!!refundTarget}
          onOpenChange={(open) => !open && setRefundTarget(null)}
          studentId={refundTarget.id}
          studentName={refundTarget.name}
          onSuccess={refresh}
        />
      )}
    </div>
  );
}
