"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  receiptNumber: string | null;
  note: string | null;
  branchId: number | null;
  createdAt: string;
  student: { id: number; firstName: string; lastName: string };
  receivedBy: { id: number; firstName: string; lastName: string } | null;
}

const methodLabels: Record<string, string> = {
  CASH: "Naqd",
  PAYME: "Payme",
  CLICK: "Click",
  UZUM: "Uzum",
  TRANSFER: "O'tkazma",
};

const methodColors: Record<string, string> = {
  CASH: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  PAYME: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  CLICK: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  UZUM: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  TRANSFER: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
};

function formatPrice(n: number) {
  return n.toLocaleString("en-US");
}

interface Props {
  refreshKey?: number;
  startDate?: string;
  endDate?: string;
}

export function RecentPaymentsTable({ refreshKey, startDate, endDate }: Props) {
  const { selectedBranch } = useBranchSwitcher();

  const { data, isLoading } = useQuery({
    queryKey: ["recent-payments", selectedBranch?.id, refreshKey, startDate, endDate],
    queryFn: () =>
      api
        .get<{ data: Payment[]; total: number }>("/payments", {
          params: {
            branchId: selectedBranch?.id,
            pageSize: 10,
            page: 1,
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
          },
        })
        .then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded" />
        ))}
      </div>
    );
  }

  const payments = data?.data ?? [];

  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Hali to&apos;lov qayd qilinmagan
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 border-r">#</TableHead>
          <TableHead>O&apos;quvchi</TableHead>
          <TableHead>Summa</TableHead>
          <TableHead>Usul</TableHead>
          <TableHead>Qabul qildi</TableHead>
          <TableHead>Sana</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p, i) => (
          <TableRow key={p.id}>
            <TableCell className="border-r text-muted-foreground">
              {i + 1}
            </TableCell>
            <TableCell className="font-medium">
              <Link
                href={`/students/profile/${p.student.id}`}
                className="hover:underline hover:text-primary transition-colors"
              >
                #{p.student.id} {p.student.firstName} {p.student.lastName}
              </Link>
            </TableCell>
            <TableCell className="text-green-600 font-medium">
              +{formatPrice(p.amount)} so&apos;m
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className={methodColors[p.method]}>
                {methodLabels[p.method] ?? p.method}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {p.receivedBy
                ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}`
                : "—"}
            </TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {format(new Date(p.createdAt), "dd.MM.yyyy, HH:mm")}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
