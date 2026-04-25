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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { ChangeStatusDialog } from "@/components/shared/change-status-dialog";
import { StatusHistoryDialog } from "@/components/shared/status-history-dialog";
import { EnrollToGroupDialog } from "@/components/students/enroll-to-group-dialog";
import { useEditStudent } from "@/hooks/use-edit-student";
import api from "@/lib/api";
import toast from "react-hot-toast";
import type { Student } from "@/data/student-model";

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

  const { data: departureReasons } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ["departure-reasons"],
    queryFn: () =>
      api.get<{ id: string; name: string }[]>("/departure-reasons").then((r) => r.data),
    enabled: showRemove && !!enrollmentId,
  });

  const hasConfiguredReasons = (departureReasons?.length ?? 0) > 0;
  const trimmedReason = removeReason.trim();
  const canRemove = hasConfiguredReasons ? removeReasonId !== null : true;

  const handleRemoveFromGroup = async () => {
    if (!enrollmentId || !canRemove) return;
    setRemoving(true);
    setShowRemove(false);
    onDeleted?.(student.id);
    try {
      const payload: { departureReasonId?: string; reason?: string } = {};
      if (removeReasonId) payload.departureReasonId = removeReasonId;
      if (trimmedReason) payload.reason = trimmedReason;
      await api.delete(`/students/${student.id}/enroll/${enrollmentId}`, {
        data: payload,
      });
      toast.success("O'quvchi guruhdan chiqarildi");
    } catch (error: any) {
      const msg = error?.response?.data?.message || "Chiqarishda xatolik yuz berdi";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setRemoving(false);
      setRemoveReason("");
      setRemoveReasonId(null);
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
        <AlertDialog
          open={showRemove}
          onOpenChange={(open) => {
            setShowRemove(open);
            if (!open) {
              setRemoveReason("");
              setRemoveReasonId(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Guruhdan chiqarishni tasdiqlang</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{studentName}</strong> guruhdan chiqarilsinmi?
              </AlertDialogDescription>
            </AlertDialogHeader>
            {hasConfiguredReasons ? (
              <div className="space-y-2">
                <Select
                  value={removeReasonId ?? undefined}
                  onValueChange={(v) => setRemoveReasonId(v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Ketish sababini tanlang" />
                  </SelectTrigger>
                  <SelectContent>
                    {departureReasons?.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  placeholder="Qo'shimcha izoh (ixtiyoriy)"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>
            ) : (
              <Textarea
                placeholder="Sabab yozing (ixtiyoriy)..."
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                rows={2}
                className="resize-none"
              />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={removing}>Bekor qilish</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRemoveFromGroup}
                disabled={removing || !canRemove}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removing ? "Chiqarilmoqda..." : "Chiqarish"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
