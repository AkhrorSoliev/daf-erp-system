"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, PlayCircle } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { AutoPausedItem, AutoPausedResponse } from "./outreach-types";
import type { LogCallPrefill } from "./log-call-dialog";

interface PausedTabProps {
  isActive: boolean;
  onLogCall: (prefill: LogCallPrefill | null) => void;
}

export function PausedTab({ isActive, onLogCall }: PausedTabProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<AutoPausedItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "auto-paused"],
    queryFn: () =>
      api.get<AutoPausedResponse>("/outreach/auto-paused").then((r) => r.data),
    enabled: isActive,
    staleTime: 0,
  });

  const reactivate = useMutation({
    // `ACTIVE` uchun sabab talab qilinmaydi — `STATUS_TO_EXIT_TYPE` da u yo'q.
    mutationFn: (studentId: number) =>
      api.patch(`/students/${studentId}/status`, { status: "ACTIVE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreach", "auto-paused"] });
      queryClient.invalidateQueries({
        queryKey: ["outreach", "removal-queue"],
      });
      queryClient.invalidateQueries({ queryKey: ["outreach-stats"] });
      toast.success("O'quvchi faollashtirildi");
      setTarget(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Faollashtirishda xatolik"));
    },
  });

  if (isLoading) return <SkeletonRows />;

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
        Avtomatik pauzaga tushgan o&apos;quvchi yo&apos;q.
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 border-r">#</TableHead>
              <TableHead>O&apos;quvchi</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Guruh / kurs</TableHead>
              <TableHead>Pauza sanasi</TableHead>
              <TableHead>Sabab</TableHead>
              <TableHead>Balans</TableHead>
              <TableHead className="w-56">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((row, idx) => (
              <TableRow key={row.studentId}>
                <TableCell className="border-r text-muted-foreground">
                  {idx + 1}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/students/profile/${row.student.id}`}
                    className="hover:underline"
                  >
                    {row.student.firstName} {row.student.lastName}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    #{row.student.id}
                  </div>
                </TableCell>
                <TableCell>{formatPhone(row.student.phone)}</TableCell>
                <TableCell>
                  {row.group ? (
                    <>
                      <Link
                        href={`/groups/${row.group.id}`}
                        className="hover:underline"
                      >
                        {row.group.name}
                      </Link>
                      {row.group.course?.name && (
                        <div className="text-xs text-muted-foreground">
                          {row.group.course.name}
                        </div>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {row.pausedAt ? formatDate(row.pausedAt) : "—"}
                </TableCell>
                <TableCell className="max-w-64 text-sm text-muted-foreground">
                  {row.reason ?? "—"}
                </TableCell>
                <TableCell
                  className={
                    row.student.balance < 0
                      ? "font-medium text-red-600"
                      : "text-muted-foreground"
                  }
                >
                  {formatSom(row.student.balance)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {row.calledToday && (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        Bog&apos;lanildi
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onLogCall({
                          studentId: row.student.id,
                          studentLabel: `${row.student.firstName} ${row.student.lastName}`,
                          studentPhone: row.student.phone,
                          reason: "REMOVAL",
                        })
                      }
                    >
                      <PhoneCall className="mr-1 h-3.5 w-3.5" />
                      Qo&apos;ng&apos;iroq
                    </Button>
                    <Button size="sm" onClick={() => setTarget(row)}>
                      <PlayCircle className="mr-1 h-3.5 w-3.5" />
                      Faollashtirish
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={!!target}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target
                ? `${target.student.firstName} ${target.student.lastName}ni faollashtirasizmi?`
                : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              O&apos;quvchi guruh ro&apos;yxatiga qaytadi va darslari uchun yana
              hisob yozila boshlaydi. Ketma-ket qoldirish sanog&apos;i noldan
              boshlanadi — ya&apos;ni u yana chegaracha dars imkoniyati oladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={reactivate.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (target) reactivate.mutate(target.studentId);
              }}
            >
              Faollashtirish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 rounded-md border p-4">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("uz-UZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatPhone(phone: string | null) {
  if (!phone) return "—";
  return `+998 ${phone.slice(0, 2)} ${phone.slice(2, 5)} ${phone.slice(5, 7)} ${phone.slice(7, 9)}`;
}

function formatSom(amount: number) {
  return `${new Intl.NumberFormat("uz-UZ").format(amount)} so'm`;
}
