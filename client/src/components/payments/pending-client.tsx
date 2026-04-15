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
import { Badge } from "@/components/ui/badge";
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { RecordPaymentDialog } from "./record-payment-dialog";

interface PendingStudent {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  balance: number;
  enrollments: {
    group: { name: string; course: { name: string; price: number } };
  }[];
}

function formatPrice(n: number) {
  return n.toLocaleString("en-US");
}

export function PendingClient() {
  const { selectedBranch } = useBranchSwitcher();
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["pending-students", selectedBranch?.id, page, refreshKey],
    queryFn: () =>
      api
        .get<{ data: PendingStudent[]; total: number }>("/payments/pending-students", {
          params: { branchId: selectedBranch?.id, page, pageSize: 20 },
        })
        .then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Kutilyotgan to&apos;lovlar
          </h2>
          <p className="text-sm text-muted-foreground">
            To&apos;lov qilishi kerak bo&apos;lgan o&apos;quvchilar ({data?.total ?? 0} ta)
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
          Hozircha kutilyotgan to&apos;lov yo&apos;q
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Guruh</TableHead>
              <TableHead>Kurs narxi</TableHead>
              <TableHead>Balans</TableHead>
              <TableHead>Holat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((s, i) => (
              <TableRow key={s.id}>
                <TableCell className="border-r text-muted-foreground">
                  {(page - 1) * 20 + i + 1}
                </TableCell>
                <TableCell className="font-medium">
                  #{s.id} {s.firstName} {s.lastName}
                </TableCell>
                <TableCell className="text-sm">
                  {s.enrollments.map((e) => e.group.name).join(", ") || "—"}
                </TableCell>
                <TableCell className="text-sm">
                  {s.enrollments[0]
                    ? `${formatPrice(s.enrollments[0].group.course.price)} so'm`
                    : "—"}
                </TableCell>
                <TableCell
                  className={`font-medium ${s.balance < 0 ? "text-red-600" : "text-amber-600"}`}
                >
                  {formatPrice(s.balance)} so&apos;m
                </TableCell>
                <TableCell>
                  {s.balance < 0 ? (
                    <Badge variant="destructive">Qarzdor</Badge>
                  ) : (
                    <Badge variant="secondary">To&apos;lov kutilmoqda</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.total > 20 && (
        <div className="flex justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Oldingi
          </Button>
          <Button variant="outline" size="sm" disabled={page * 20 >= data.total} onClick={() => setPage((p) => p + 1)}>
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
