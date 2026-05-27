"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, PhoneCall, UserMinus } from "lucide-react";
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
import { StudentRemoveFromGroupDialog } from "@/components/students/student-remove-from-group-dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { DebtWriteOffEligibility } from "@/components/students/debt-write-off-types";
import type {
  RemovalQueueItem,
  RemovalQueueResponse,
} from "./outreach-types";
import type { AddCallbackPrefill } from "./add-callback-dialog";
import { TablePagination } from "./table-pagination";

interface RemovalQueueTabProps {
  isActive: boolean;
  onAddCallback: (prefill: AddCallbackPrefill | null) => void;
}

interface RemoveTarget {
  studentId: number;
  enrollmentId: string;
  studentName: string;
}

export function RemovalQueueTab({
  isActive,
  onAddCallback,
}: RemovalQueueTabProps) {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<RemoveTarget | null>(null);
  const [reasonId, setReasonId] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [writeOff, setWriteOff] = useState(false);
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
  const writeOffReady =
    !writeOff || (writeOffReason.trim().length >= 5 && !!eligibility?.eligible);
  const canSubmit =
    (hasConfiguredReasons ? reasonId !== null : trimmedReason.length > 0) &&
    writeOffReady;

  function resetForm() {
    setTarget(null);
    setReasonId(null);
    setReasonText("");
    setWriteOff(false);
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
      if (writeOff && eligibility?.eligible) {
        payload.writeOffCycleDebt = true;
        payload.writeOffReason = writeOffReason.trim();
        payload.writeOffConfirmAmount = eligibility.details.suggestedWriteOff;
      }
      await api.delete(
        `/students/${target.studentId}/enroll/${target.enrollmentId}`,
        { data: payload },
      );
      toast.success(
        writeOff && eligibility?.eligible
          ? "O'quvchi chiqarildi va joriy sikl qarzi hisobdan chiqarildi"
          : "O'quvchi guruhdan chiqarildi",
      );
      // Invalidate both queues — the removed student likely appears in the
      // today-absentees list too (since 3-strike implies they were ABSENT today).
      queryClient.invalidateQueries({ queryKey: ["outreach", "removal-queue"] });
      queryClient.invalidateQueries({
        queryKey: ["outreach", "today-absentees"],
      });
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
                  <TableHead>Ketma-ket ABSENT</TableHead>
                  <TableHead>Oxirgi yo&apos;qlik</TableHead>
                  <TableHead className="w-56">Amal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((row, idx) => (
                  <Row
                    key={row.enrollmentId}
                    row={row}
                    index={(page - 1) * pageSize + idx}
                    onCall={() =>
                      onAddCallback({
                        entityType: "Student",
                        entityId: String(row.student.id),
                        entityLabel: `${row.student.firstName} ${row.student.lastName}`,
                        entityPhone: row.student.phone,
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
        {row.student.firstName} {row.student.lastName}
        <div className="text-xs text-muted-foreground">#{row.student.id}</div>
      </TableCell>
      <TableCell>{formatPhone(row.student.phone)}</TableCell>
      <TableCell>{formatPhone(row.student.parentPhone)}</TableCell>
      <TableCell>
        {row.group.name}
        {row.group.course?.name && (
          <div className="text-xs text-muted-foreground">{row.group.course.name}</div>
        )}
      </TableCell>
      <TableCell>
        {row.teacher
          ? `${row.teacher.firstName} ${row.teacher.lastName}`
          : "—"}
      </TableCell>
      <TableCell>
        <StreakBadge count={row.consecutiveAbsentCount} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {formatDate(row.lastAbsenceDate)}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={onCall}>
            <PhoneCall className="mr-1 size-3.5" />
            Aloqa
          </Button>
          <Button size="sm" variant="destructive" onClick={onRemove}>
            <UserMinus className="mr-1 size-3.5" />
            Chiqarish
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/students/profile/${row.student.id}`}>
              <ExternalLink className="size-3.5" />
            </Link>
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
