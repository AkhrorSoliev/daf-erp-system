"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, RefreshCw, History, UserPlus, UserMinus } from "lucide-react";
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
  /** When set, shows "Guruhdan chiqarish" instead of "O'chirish" */
  enrollmentId?: string;
  onDeleted?: (id: number) => void;
  onStatusChanged?: (id: number, newStatus: string) => void;
}

export function StudentRowActions({ student, enrollmentId, onDeleted, onStatusChanged }: StudentRowActionsProps) {
  const { openDrawer } = useEditStudent();
  const [showDelete, setShowDelete] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteReasonId, setDeleteReasonId] = useState<string | null>(null);

  const { data: departureReasons } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ["departure-reasons"],
    queryFn: () =>
      api.get<{ id: string; name: string }[]>("/departure-reasons").then((r) => r.data),
    enabled: showDelete && !!enrollmentId,
  });

  const hasConfiguredReasons = (departureReasons?.length ?? 0) > 0;
  const canSubmit = enrollmentId && hasConfiguredReasons
    ? deleteReasonId !== null
    : true;

  const handleDelete = async () => {
    if (!canSubmit) return;
    setDeleting(true);
    setShowDelete(false);
    onDeleted?.(student.id);
    try {
      if (enrollmentId) {
        const payload: { departureReasonId?: string; reason?: string } = {};
        if (deleteReasonId) payload.departureReasonId = deleteReasonId;
        if (deleteReason.trim()) payload.reason = deleteReason.trim();
        await api.delete(`/students/${student.id}/enroll/${enrollmentId}`, {
          data: payload,
        });
        toast.success("O'quvchi guruhdan chiqarildi");
      } else {
        await api.delete(`/students/${student.id}`);
        toast.success("O'quvchi muvaffaqiyatli o'chirildi");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || "O'chirishda xatolik yuz berdi";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setDeleting(false);
      setDeleteReason("");
      setDeleteReasonId(null);
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => setShowDelete(true)}
          >
            {enrollmentId ? (
              <><UserMinus className="mr-2 size-4" />Guruhdan chiqarish</>
            ) : (
              <><Trash2 className="mr-2 size-4" />O&apos;chirish</>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{enrollmentId ? "Guruhdan chiqarishni tasdiqlang" : "O'chirishni tasdiqlang"}</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{studentName}</strong> {enrollmentId ? "guruhdan chiqarilsinmi?" : "arxivga o'tkazilsinmi?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {enrollmentId && hasConfiguredReasons ? (
            <div className="space-y-2">
              <Select
                value={deleteReasonId ?? undefined}
                onValueChange={(v) => setDeleteReasonId(v)}
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
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          ) : (
            <Textarea
              placeholder="Sabab yozing (ixtiyoriy)..."
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              rows={2}
              className="resize-none"
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting || !canSubmit}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? (enrollmentId ? "Chiqarilmoqda..." : "O'chirilmoqda...")
                : (enrollmentId ? "Chiqarish" : "O'chirish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChangeStatusDialog
        open={showStatus}
        onOpenChange={setShowStatus}
        entityType="students"
        entityId={student.id}
        entityName={studentName}
        currentStatus={student.status || "ACTIVE"}
        onStatusChanged={(newStatus) => onStatusChanged?.(student.id, newStatus)}
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
