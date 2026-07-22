"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { HandCoins } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
import { EXPENSE_METHOD_LABELS } from "./expenses-filter-bar";
import { monthLabel } from "./salary-utils";

export interface AdvanceTarget {
  userId: number;
  name: string;
  month: string;
}

interface AdvanceRow {
  id: string;
  amount: number;
  date: string;
  paymentMethod: "CASH" | "CARD";
  description: string;
  createdAt: string;
  createdBy: { id: number; firstName: string; lastName: string };
}

interface AdvancesResponse {
  month: string;
  userId: number;
  count: number;
  total: number;
  advances: AdvanceRow[];
}

interface Props {
  target: AdvanceTarget | null;
  onClose: () => void;
}

/**
 * Read-only drawer opened from the "Avans" cell on the salary table. Lists every
 * TEACHER_ADVANCE the teacher received in the selected month — so an advance
 * taken "3 ga bo'lib" shows as 3 rows, each with when it was taken and who gave
 * it.
 */
export function SalaryAdvanceBreakdownDrawer({ target, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["salary-advances", target?.userId, target?.month],
    queryFn: () =>
      api
        .get<AdvancesResponse>(`/salary/advances/${target!.userId}`, {
          params: { month: target!.month },
        })
        .then((r) => r.data),
    enabled: !!target,
  });

  const advances = data?.advances ?? [];

  return (
    <Sheet open={!!target} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="flex items-center gap-2">
            <HandCoins className="size-5 text-amber-600" />
            Avanslar
          </SheetTitle>
          <SheetDescription>
            {target?.name} · {target ? monthLabel(target.month) : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : advances.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Bu oyda avans berilmagan.
            </p>
          ) : (
            <>
              {/* Total summary */}
              <div className="mb-4 rounded-md border bg-muted/20 p-4">
                <div className="text-xs text-muted-foreground">
                  Jami avans ({data?.count} ta)
                </div>
                <div className="text-xl font-semibold tabular-nums">
                  {formatPrice(data?.total ?? 0)} so&apos;m
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 border-r">#</TableHead>
                    <TableHead>Sana</TableHead>
                    <TableHead className="text-right">Summa</TableHead>
                    <TableHead>Turi</TableHead>
                    <TableHead>Kim bergan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {advances.map((a, i) => (
                    <TableRow key={a.id}>
                      <TableCell className="border-r text-muted-foreground tabular-nums">
                        {i + 1}
                      </TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(a.date), "dd.MM.yyyy")}
                        {a.description && a.description !== "Avans" && (
                          <span className="block text-xs text-muted-foreground">
                            {a.description}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatPrice(a.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">
                          {EXPENSE_METHOD_LABELS[a.paymentMethod] ??
                            a.paymentMethod}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.createdBy.firstName} {a.createdBy.lastName}
                        <span className="block text-xs text-muted-foreground">
                          {format(new Date(a.createdAt), "dd.MM.yyyy, HH:mm")}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
