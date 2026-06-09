"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PhoneCall, UserMinus } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  StudentRemoveFromGroupDialog,
  resolveWriteOffAmount,
  type WriteOffChoice,
} from "@/components/students/student-remove-from-group-dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { DebtWriteOffEligibility } from "@/components/students/debt-write-off-types";
import type {
  RemovalQueueItem,
  RemovalQueueResponse,
} from "./outreach-types";
import type { LogCallPrefill } from "./log-call-dialog";
import { TablePagination } from "./table-pagination";

interface RemovalQueueTabProps {
  isActive: boolean;
  onLogCall: (prefill: LogCallPrefill | null) => void;
}

interface RemoveTarget {
  studentId: number;
  enrollmentId: string;
  studentName: string;
}

export function RemovalQueueTab({
  isActive,
  onLogCall,
}: RemovalQueueTabProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<RemoveTarget | null>(null);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [writeOff, setWriteOff] = useState(false);
  const [writeOffChoice, setWriteOffChoice] = useState<WriteOffChoice>("real");
  const [writeOffCustomAmount, setWriteOffCustomAmount] = useState("");
  const [writeOffReason, setWriteOffReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data, isLoading } = useQuery({
    queryKey: ["outreach", "removal-queue"],
    queryFn: () =>
      api
        .get<RemovalQueueResponse>("/outreach/removal-queue")
        .then((r) => r.data),
    enabled: isActive,
    staleTime: 0,
  });

  const { data: reasons } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["student-exit-reasons", "GROUP_REMOVAL"],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>("/student-exit-reasons", {
          params: { appliesTo: "GROUP_REMOVAL" },
        })
        .then((r) => r.data),
    enabled: target !== null,
  });

  const { data: eligibility, isFetching: eligibilityLoading } =
    useQuery<DebtWriteOffEligibility>({
      queryKey: [
        "debt-write-off-eligibility",
        target?.studentId,
        target?.enrollmentId,
      ],
      queryFn: () =>
        api
          .get<DebtWriteOffEligibility>(
            `/students/${target!.studentId}/enrollments/${target!.enrollmentId}/debt-write-off-eligibility`,
          )
          .then((r) => r.data),
      enabled: target !== null,
      staleTime: 0,
    });

  const hasConfiguredReasons = (reasons?.length ?? 0) > 0;
  const trimmedReason = reasonText.trim();
  const resolvedWriteOffAmount =
    writeOff && eligibility?.eligible
      ? resolveWriteOffAmount(
          writeOffChoice,
          writeOffCustomAmount,
          eligibility.details,
        )
      : null;
  const writeOffReady =
    !writeOff ||
    (writeOffReason.trim().length >= 5 &&
      !!eligibility?.eligible &&
      resolvedWriteOffAmount !== null);
  const canSubmit =
    (hasConfiguredReasons ? reasonId !== null : trimmedReason.length > 0) &&
    writeOffReady;

  function resetForm() {
    setTarget(null);
    setReasonId(null);
    setReasonText("");
    setWriteOff(false);
    setWriteOffChoice("real");
    setWriteOffCustomAmount("");
    setWriteOffReason("");
  }

  async function handleRemove() {
    if (!target || !canSubmit) return;
    setRemoving(true);
    try {
      const payload: {
        departureReasonId?: string;
        reason?: string;
        writeOffCycleDebt?: boolean;
        writeOffReason?: string;
        writeOffConfirmAmount?: number;
      } = {};
      if (reasonId) payload.departureReasonId = reasonId;
      if (trimmedReason) payload.reason = trimmedReason;
      if (writeOff && eligibility?.eligible && resolvedWriteOffAmount !== null) {
        payload.writeOffCycleDebt = true;
        payload.writeOffReason = writeOffReason.trim();
        payload.writeOffConfirmAmount = resolvedWriteOffAmount;
      }
      await api.delete(
        `/students/${target.studentId}/enroll/${target.enrollmentId}`,
        { data: payload },
      );
      toast.success(
        writeOff && eligibility?.eligible
          ? "O'quvchi chiqarildi va qarz hisobdan chiqarildi"
          : "O'quvchi guruhdan chiqarildi",
      );
      // Invalidate all 3 list queries + the stats widget — the removed student
      // likely appears in the today-absentees list too (since 3-strike implies
      // they were ABSENT today).
      queryClient.invalidateQueries({ queryKey: ["outreach", "removal-queue"] });
      queryClient.invalidateQueries({
        queryKey: ["outreach", "today-absentees"],
      });
      queryClient.invalidateQueries({ queryKey: ["outreach", "stats"] });
      resetForm();
    } catch (error) {
      toast.error(getErrorMessage(error, "Chiqarishda xatolik yuz berdi"));
    } finally {
      setRemoving(false);
    }
  }

  // useMemo must run before any conditional return (React hooks rules).
  // Depend on data?.items directly so the dep is stable when data is set;
  // wrapping in `?? []` per-render would bust memoization on every render.
  const items = data?.items;
  const total = items?.length ?? 0;
  const paged = useMemo(() => {
    if (!items) return [];
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  // Clamp the page if the list shrank (e.g. after removing a student) so the
  // user never lands on an out-of-range empty page.
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [total, pageSize, page]);

  if (isLoading) return <SkeletonRows />;

  return (
    <>
      {total === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Ketma-ket 3 va undan ko&apos;p marta darsga kelmagan o&apos;quvchi yo&apos;q
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 border-r">#</TableHead>
                  <TableHead>O&apos;quvchi</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Ota-ona telefoni</TableHead>
                  <TableHead>Guruh / kurs</TableHead>
                  <TableHead>O&apos;qituvchi</TableHead>
                  <TableHead>Ketma-ket kelmagan</TableHead>
                  <TableHead>Oxirgi marta kelgan</TableHead>
                  <TableHead className="w-72">Amal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row, idx) => (
                  <Row
                    key={row.enrollmentId}
                    row={row}
                    index={(page - 1) * pageSize + idx}
                    onCall={() =>
                      onLogCall({
                        studentId: row.student.id,
                        studentLabel: `${row.student.firstName} ${row.student.lastName}`,
                        studentPhone: row.student.phone,
                        reason: "REMOVAL",
                      })
                    }
                    onRemove={() =>
                      setTarget({
                        studentId: row.student.id,
                        enrollmentId: row.enrollmentId,
                        studentName: `${row.student.firstName} ${row.student.lastName}`,
                      })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}

      <StudentRemoveFromGroupDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) resetForm();
        }}
        reasons={reasons}
        reasonId={reasonId}
        onReasonIdChange={setReasonId}
        reasonText={reasonText}
        onReasonTextChange={setReasonText}
        removing={removing}
        canSubmit={canSubmit}
        onConfirm={handleRemove}
        eligibility={eligibility}
        eligibilityLoading={eligibilityLoading}
        writeOff={writeOff}
        onWriteOffChange={setWriteOff}
        writeOffChoice={writeOffChoice}
        onWriteOffChoiceChange={setWriteOffChoice}
        writeOffCustomAmount={writeOffCustomAmount}
        onWriteOffCustomAmountChange={setWriteOffCustomAmount}
        writeOffReason={writeOffReason}
        onWriteOffReasonChange={setWriteOffReason}
      />
    </>
  );
}

function Row({
  row,
  index,
  onCall,
  onRemove,
}: {
  row: RemovalQueueItem;
  index: number;
  onCall: () => void;
  onRemove: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="border-r text-muted-foreground">{index + 1}</TableCell>
      <TableCell className="font-medium">
        <Link
          href={`/students/profile/${row.student.id}`}
          className="hover:underline"
        >
          {row.student.firstName} {row.student.lastName}
        </Link>
        <div className="text-xs text-muted-foreground">#{row.student.id}</div>
      </TableCell>
      <TableCell>{formatPhone(row.student.phone)}</TableCell>
      <TableCell>{formatPhone(row.student.parentPhone)}</TableCell>
      <TableCell>
        <Link href={`/groups/${row.group.id}`} className="hover:underline">
          {row.group.name}
        </Link>
        {row.group.course?.name && (
          <div className="text-xs text-muted-foreground">
            {row.group.course.name}
          </div>
        )}
      </TableCell>
      <TableCell>
        {row.teacher ? (
          <Link
            href={`/teachers/profile/${row.teacher.id}`}
            className="hover:underline"
          >
            {row.teacher.firstName} {row.teacher.lastName}
          </Link>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell>
        <StreakBadge count={row.consecutiveAbsentCount} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.lastPresentDate ? formatDate(row.lastPresentDate) : "Hech qachon"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {row.calledToday && (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Bog&apos;lanildi
            </Badge>
          )}
          <Button
            size="sm"
            variant={row.calledToday ? "ghost" : "outline"}
            onClick={onCall}
          >
            <PhoneCall className="mr-1 size-3.5" />
            Natija kiritish
          </Button>
          <Button size="sm" variant="destructive" onClick={onRemove}>
            <UserMinus className="mr-1 size-3.5" />
            Chiqarish
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function StreakBadge({ count }: { count: number }) {
  let className = "bg-amber-100 text-amber-800";
  if (count >= 5) className = "bg-red-100 text-red-800";
  else if (count >= 4) className = "bg-orange-100 text-orange-800";
  return (
    <Badge className={`${className} hover:${className}`} variant="outline">
      {count} marta
    </Badge>
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
    const d = new Date(iso);
    return d.toLocaleDateString("uz-UZ", {
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
