"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, RefreshCw, History, UserPlus, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
import { StatusHistoryDialog } from "@/components/shared/status-history-dialog";
import { EnrollToGroupDialog } from "@/components/students/enroll-to-group-dialog";
import { StudentRemoveFromGroupDialog } from "@/components/students/student-remove-from-group-dialog";
import { useEditStudent } from "@/hooks/use-edit-student";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import toast from "react-hot-toast";
import type { Student } from "@/data/student-model";
import type { DebtWriteOffEligibility } from "@/components/students/debt-write-off-types";

interface StudentRowActionsProps {
  student: Student;
  /** When set, shows an additional "Guruhdan chiqarish" item (enrollment-level removal). */
  enrollmentId?: string;
  onDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, newStatus: string) => void;
}

export function StudentRowActions({ student, enrollmentId, onDeleted, onStatusChanged }: StudentRowActionsProps) {
  const { openDrawer } = useEditStudent();
  const [showRemove, setShowRemove] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeReason, setRemoveReason] = useState("");
  const [removeReasonId, setRemoveReasonId] = useState<string | null>(null);
  const [writeOff, setWriteOff] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState("");

  const { data: departureReasons } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ["student-exit-reasons", "GROUP_REMOVAL"],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>("/student-exit-reasons", {
          params: { appliesTo: "GROUP_REMOVAL" },
        })
        .then((r) => r.data),
    enabled: showRemove && !!enrollmentId,
  });

  const { data: eligibility, isFetching: eligibilityLoading } =
    useQuery<DebtWriteOffEligibility>({
      queryKey: ["debt-write-off-eligibility", student.id, enrollmentId],
      queryFn: () =>
        api
          .get<DebtWriteOffEligibility>(
            `/students/${student.id}/enrollments/${enrollmentId}/debt-write-off-eligibility`,
          )
          .then((r) => r.data),
      enabled: showRemove && !!enrollmentId,
      staleTime: 0,
    });

  const hasConfiguredReasons = (departureReasons?.length ?? 0) > 0;
  const trimmedReason = removeReason.trim();
  const writeOffReady =
    !writeOff || (writeOffReason.trim().length >= 5 && !!eligibility?.eligible);
  const canRemove =
    (hasConfiguredReasons
      ? removeReasonId !== null
      : trimmedReason.length > 0) && writeOffReady;

  const handleRemoveFromGroup = async () => {
    if (!enrollmentId || !canRemove) return;
    setRemoving(true);
    setShowRemove(false);
    onDeleted?.(student.id);
    try {
      const payload: {
        departureReasonId?: string;
        reason?: string;
        writeOffCycleDebt?: boolean;
        writeOffReason?: string;
        writeOffConfirmAmount?: number;
      } = {};
      if (removeReasonId) payload.departureReasonId = removeReasonId;
      if (trimmedReason) payload.reason = trimmedReason;
      if (writeOff && eligibility?.eligible) {
        payload.writeOffCycleDebt = true;
        payload.writeOffReason = writeOffReason.trim();
        payload.writeOffConfirmAmount = eligibility.details.suggestedWriteOff;
      }
      await api.delete(`/students/${student.id}/enroll/${enrollmentId}`, {
        data: payload,
      });
      toast.success(
        writeOff && eligibility?.eligible
          ? "O'quvchi chiqarildi va joriy sikl qarzi hisobdan chiqarildi"
          : "O'quvchi guruhdan chiqarildi",
      );
    } catch (error) {
      toast.error(getErrorMessage(error, "Chiqarishda xatolik yuz berdi"));
    } finally {
      setRemoving(false);
      setRemoveReason("");
      setRemoveReasonId(null);
      setWriteOff(false);
      setWriteOffReason("");
    }
  };

  const handleStatusChanged = (newStatus: string) => {
    if (newStatus === "ARCHIVED") {
      onDeleted?.(student.id);
    } else {
      onStatusChanged?.(student.id, newStatus);
    }
  };

  const studentName = `${student.firstName} ${student.lastName}`;

  return (
    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
                <span className="sr-only">Amallar</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Amallar</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={() => openDrawer(student)}>
            <Pencil className="mr-2 size-4" />
            Tahrirlash
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowEnroll(true)}>
            <UserPlus className="mr-2 size-4" />
            Guruhga biriktirish
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowStatus(true)}>
            <RefreshCw className="mr-2 size-4" />
            Status o&apos;zgartirish
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowHistory(true)}>
            <History className="mr-2 size-4" />
            Status tarixi
          </DropdownMenuItem>
          {enrollmentId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowRemove(true)}
              >
                <UserMinus className="mr-2 size-4" />
                Guruhdan chiqarish
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {enrollmentId && (
        <StudentRemoveFromGroupDialog
          open={showRemove}
          onOpenChange={(open) => {
            setShowRemove(open);
            if (!open) {
              setRemoveReason("");
              setRemoveReasonId(null);
              setWriteOff(false);
              setWriteOffReason("");
            }
          }}
          reasons={departureReasons}
          reasonId={removeReasonId}
          onReasonIdChange={setRemoveReasonId}
          reasonText={removeReason}
          onReasonTextChange={setRemoveReason}
          removing={removing}
          canSubmit={canRemove}
          onConfirm={handleRemoveFromGroup}
          eligibility={eligibility}
          eligibilityLoading={eligibilityLoading}
          writeOff={writeOff}
          onWriteOffChange={setWriteOff}
          writeOffReason={writeOffReason}
          onWriteOffReasonChange={setWriteOffReason}
        />
      )}

      <ChangeStatusDialog
        open={showStatus}
        onOpenChange={setShowStatus}
        entityType="students"
        entityId={student.id}
        entityName={studentName}
        currentStatus={student.status || "ACTIVE"}
        onStatusChanged={handleStatusChanged}
      />

      <StatusHistoryDialog
        open={showHistory}
        onOpenChange={setShowHistory}
        entityType="students"
        entityId={student.id}
        entityName={studentName}
      />

      <EnrollToGroupDialog
        open={showEnroll}
        onOpenChange={setShowEnroll}
        studentId={student.id}
        studentName={studentName}
        enrolledGroupIds={student.groups?.map((g) => g.id) ?? []}
      />
    </div>
  );
}
