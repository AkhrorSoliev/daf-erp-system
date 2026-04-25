"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface Contract {
  id: string;
  contractNumber: string;
  totalAmount: number;
  paidAmount: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  student: { id: number; firstName: string; lastName: string };
  course: { id: string; name: string };
  group: { id: string; name: string } | null;
}

const statusLabels: Record<string, string> = {
  DRAFT: "Qoralama",
  ACTIVE: "Faol",
  COMPLETED: "Tugallangan",
  CANCELLED: "Bekor qilingan",
  REFUNDED: "Qaytarilgan",
};

const statusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-800",
  ACTIVE: "bg-green-100 text-green-800",
  COMPLETED: "bg-blue-100 text-blue-800",
  CANCELLED: "bg-red-100 text-red-800",
  REFUNDED: "bg-amber-100 text-amber-800",
};

export function ContractsClient() {
  const { selectedBranch } = useBranchSwitcher();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [totalAmount, setTotalAmount] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["contracts", selectedBranch?.id, refreshKey],
    queryFn: () =>
      api
        .get<{ data: Contract[]; total: number }>("/contracts", {
          params: { branchId: selectedBranch?.id, pageSize: 50 },
        })
        .then((r) => r.data),
  });

  const rawAmount = parseInt(totalAmount.replace(/\D/g, ""), 10) || 0;

  const handleSubmit = async () => {
    const sid = parseInt(studentId, 10);
    if (!sid || !courseId || rawAmount < 1) return;
    setSubmitting(true);
    try {
      await api.post("/contracts", {
        studentId: sid,
        courseId,
        branchId: selectedBranch?.id ?? 1,
        totalAmount: rawAmount,
      });
      toast.success("Shartnoma yaratildi");
      setDialogOpen(false);
      setStudentId("");
      setCourseId("");
      setTotalAmount("");
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Shartnoma yaratishda xatolik",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleAmountChange = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits) {
      setTotalAmount(parseInt(digits, 10).toLocaleString("en-US"));
    } else {
      setTotalAmount("");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Shartnomalar
          </h2>
          <p className="text-sm text-muted-foreground">
            O&apos;quvchi shartnomalarini boshqarish ({data?.total ?? 0} ta)
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4 mr-2" />
          Shartnoma yaratish
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
          Hali shartnoma yaratilmagan
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>Raqam</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Kurs</TableHead>
              <TableHead>Jami</TableHead>
              <TableHead>To&apos;langan</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Sana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.data.map((c, i) => (
              <TableRow key={c.id}>
                <TableCell className="border-r text-muted-foreground">
                  {i + 1}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {c.contractNumber}
                </TableCell>
                <TableCell className="font-medium">
                  #{c.student.id} {c.student.firstName} {c.student.lastName}
                </TableCell>
                <TableCell className="text-sm">{c.course.name}</TableCell>
                <TableCell>{formatPrice(c.totalAmount)} so&apos;m</TableCell>
                <TableCell
                  className={
                    c.paidAmount >= c.totalAmount
                      ? "text-green-600"
                      : "text-amber-600"
                  }
                >
                  {formatPrice(c.paidAmount)} so&apos;m
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={statusColors[c.status]}
                  >
                    {statusLabels[c.status] ?? c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(c.createdAt), "dd.MM.yyyy")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(v) => {
          if (!submitting) setDialogOpen(v);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yangi shartnoma</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>O&apos;quvchi ID</Label>
              <Input
                placeholder="Masalan: 10001"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Kurs ID</Label>
              <Input
                placeholder="Kurs UUID"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Jami summa</Label>
              <div className="relative">
                <Input
                  placeholder="0"
                  value={totalAmount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  inputMode="numeric"
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  so&apos;m
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              Bekor qilish
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!studentId || !courseId || rawAmount < 1 || submitting}
            >
              {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
              Yaratish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
