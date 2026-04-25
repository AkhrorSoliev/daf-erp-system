"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { RecordPaymentDialog } from "./record-payment-dialog";

interface Debtor {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  enrollments: {
    group: { name: string; course: { name: string } };
  }[];
}

export function DebtorsClient() {
  const { selectedBranch } = useBranchSwitcher();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["debtors", selectedBranch?.id, page, refreshKey],
    queryFn: () =>
      api
        .get<{ data: Debtor[]; total: number }>("/payments/debtors", {
          params: { branchId: selectedBranch?.id, page, pageSize: 20 },
        })
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Qarzdorlar
          </h2>
          <p className="text-sm text-muted-foreground">
            Balansi minus bo&apos;lgan faol o&apos;quvchilar ({data?.total ?? 0} ta)
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          To&apos;lov qayd qilish
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      ) : !data?.data.length ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Qarzdor o&apos;quvchilar yo&apos;q
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>Qarz</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((d, i) => (
              <TableRow key={d.id}>
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * 20 + i + 1}
                </TableCell>
                <TableCell className="font-medium">
                  #{d.id} {d.firstName} {d.lastName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  +998 {d.phone}
                </TableCell>
                <TableCell className="text-sm">
                  {d.enrollments.map((e) => e.group.name).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-red-600 font-medium">
                  {formatPrice(d.balance)} so&apos;m
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.total > 20 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Oldingi
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page * 20 >= data.total}
            onClick={() => setPage((p) => p + 1)}
          >
            Keyingi
          </Button>
        </div>
      )}

      <RecordPaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />
    </div>
  );
}
