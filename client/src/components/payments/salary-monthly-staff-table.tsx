"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { SALARY_STATUS_BADGE, SALARY_STATUS_LABELS } from "./salary-utils";

export interface StaffRow {
  user: {
    id: number;
    firstName: string;
    lastName: string;
    position: string | null;
    branch: { id: number; name: string } | null;
  };
  monthly: number;
  advances: number;
  netToPay: number;
  payment: { id: string; amount: number; status: string } | null;
}

export interface StaffTotals {
  monthly: number;
  advances: number;
  netToPay: number;
}

/** Backend role names → Uzbek "Lavozim" labels. */
const ROLE_LABELS: Record<string, string> = {
  CEO: "Direktor",
  "Branch Director": "Filial direktori",
  Administrator: "Administrator",
  Cashier: "Kassir",
  Teacher: "O'qituvchi",
};

/**
 * "Xodimlar oyligi" — non-teaching FIXED_MONTHLY staff (admin, cashier,
 * director). Separate from the teacher table because a flat monthly salary has
 * no deserved/covered/gap split. Clicking a settled row opens the same
 * breakdown drawer as a teacher row.
 */
export function SalaryMonthlyStaffTable({
  staff,
  totals,
  onOpenBreakdown,
}: {
  staff: StaffRow[];
  totals: StaffTotals;
  onOpenBreakdown: (paymentId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        Xodimlar oyligi (oylik xodimlar)
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger>
              <Info className="size-3.5 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              Dars o&apos;tmaydigan, qat&apos;iy oylik oladigan xodimlar. Oy
              o&apos;rtasida ishga kirgan yoki ketgan bo&apos;lsa, ishlagan
              kunlariga mutanosib (proratsiya) hisoblanadi.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Xodim</TableHead>
              <TableHead>Lavozim</TableHead>
              <TableHead className="text-right">Oylik summa</TableHead>
              <TableHead className="text-right">Avans</TableHead>
              <TableHead className="text-right">To&apos;lanishi kerak</TableHead>
              <TableHead>Holat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.map((row, idx) => {
              const p = row.payment;
              return (
                <TableRow
                  key={row.user.id}
                  className={cn(p && "cursor-pointer")}
                  onClick={p ? () => onOpenBreakdown(p.id) : undefined}
                >
                  <TableCell className="border-r text-muted-foreground tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {row.user.firstName} {row.user.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      #{row.user.id}
                      {row.user.branch ? ` · ${row.user.branch.name}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.user.position
                      ? (ROLE_LABELS[row.user.position] ?? row.user.position)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPrice(row.monthly)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.advances > 0 ? (
                      formatPrice(row.advances)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatPrice(row.netToPay)}
                  </TableCell>
                  <TableCell>
                    {p ? (
                      <Badge
                        className={cn("font-normal", SALARY_STATUS_BADGE[p.status])}
                      >
                        {SALARY_STATUS_LABELS[p.status] ?? p.status}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Hisoblanmagan
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="border-r" />
              <TableCell className="font-semibold">Jami</TableCell>
              <TableCell />
              <TableCell className="text-right font-semibold tabular-nums">
                {formatPrice(totals.monthly)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatPrice(totals.advances)}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {formatPrice(totals.netToPay)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
