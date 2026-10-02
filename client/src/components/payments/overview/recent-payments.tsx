"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { BlockError } from "./block-state";
import { PAYMENT_METHOD_LABELS, som } from "./overview-math";
import { useBranchId } from "./queries";

interface Payment {
  id: string;
  amount: number;
  method: string;
  createdAt: string;
  /** `groups` — the student's groups now; absent on a server older than B1. */
  student: { id: number; firstName: string; lastName: string; groups?: { id: string; name: string }[] };
  receivedBy: { id: number; firstName: string; lastName: string } | null;
}

const methodColors: Record<string, string> = {
  CASH: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  PAYME: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  CLICK: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  UZUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  TRANSFER: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

/**
 * Block 5 — «Oxirgi to'lovlar»: the ten latest payments in the branch scope.
 * «Guruh» is the student's group NOW, not a property of the payment.
 */
export function RecentPayments() {
  const branchId = useBranchId();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["recent-payments", branchId],
    queryFn: () =>
      api
        .get<{ data: Payment[]; total: number }>("/payments", { params: { branchId, pageSize: 10, page: 1 } })
        .then((r) => r.data),
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }
  if (isError) return <BlockError title="Oxirgi to'lovlar" onRetry={() => refetch()} />;

  const payments = data.data;
  if (payments.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Hali to&apos;lov qayd qilinmagan</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>O&apos;quvchi</TableHead>
          <TableHead>Guruh</TableHead>
          <TableHead>Summa</TableHead>
          <TableHead>Usul</TableHead>
          <TableHead>Qabul qildi</TableHead>
          <TableHead>Sana</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p, i) => (
          <TableRow key={p.id}>
            <TableCell className="border-r text-muted-foreground">{i + 1}</TableCell>
            <TableCell className="font-medium">
              <Link
                href={`/students/profile/${p.student.id}`}
                className="transition-colors hover:text-primary hover:underline"
              >
                #{p.student.id} {p.student.firstName} {p.student.lastName}
              </Link>
            </TableCell>
            <TableCell className="text-sm">
              {p.student.groups?.length ? p.student.groups.map((g) => g.name).join(", ") : "—"}
            </TableCell>
            <TableCell className="font-medium text-green-600">+{som(p.amount)}</TableCell>
            <TableCell>
              <Badge variant="secondary" className={methodColors[p.method]}>
                {PAYMENT_METHOD_LABELS[p.method] ?? p.method}
              </Badge>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {p.receivedBy ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}` : "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {format(new Date(p.createdAt), "dd.MM.yyyy, HH:mm")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
