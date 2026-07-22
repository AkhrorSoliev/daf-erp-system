"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Users } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useLeadsBoard, type LeadCard } from "@/hooks/use-leads-board";
import { useLeadsUi } from "@/hooks/use-leads-ui";
import { sortWeekdays, WEEKDAY_SHORT } from "@/lib/weekdays";

interface GroupTeacher {
  id: number;
  firstName: string;
  lastName: string;
}

interface GroupOption {
  id: string;
  name: string;
  statusEnum: string;
  course: { name: string } | null;
  teachers: GroupTeacher[];
  studentCount: number;
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  days: string | null;
  exactDays: string[];
}

const ENROLLABLE = ["ACTIVE", "FORMING", "PAUSED"];
const ODD_DAYS = ["monday", "wednesday", "friday"];
const EVEN_DAYS = ["tuesday", "thursday", "saturday"];

function getDaysList(days: string | null, exactDays: string[]): string[] {
  if (exactDays.length > 0) return sortWeekdays(exactDays);
  if (days === "odd") return ODD_DAYS;
  if (days === "even") return EVEN_DAYS;
  return [];
}

export function ConvertLeadDialog() {
  const convertLead = useLeadsUi((s) => s.convertLead);
  const closeConvertLead = useLeadsUi((s) => s.closeConvertLead);
  const applyLeadRemove = useLeadsBoard((s) => s.applyLeadRemove);
  const branches = useBranchSwitcher((s) => s.branches);

  const [branchId, setBranchId] = useState("");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = !!convertLead;

  useEffect(() => {
    if (open) {
      setBranchId("");
      setGroupId(null);
      setGroups([]);
      setGroupSearch("");
      setSubmitting(false);
    }
  }, [open]);

  // Load enrollable groups for the chosen branch. The group's own branch is
  // what the student ends up in, so groups are always scoped to the picked
  // branch — no branch, no groups.
  useEffect(() => {
    if (!open || !branchId) {
      setGroups([]);
      return;
    }
    let cancelled = false;
    setLoadingGroups(true);
    (async () => {
      try {
        const { data } = await api.get("/groups", {
          params: { branch_id: Number(branchId), pageSize: 100 },
        });
        const enrollable = (data.data || []).filter((g: GroupOption) =>
          ENROLLABLE.includes(g.statusEnum),
        );
        if (!cancelled) setGroups(enrollable);
      } catch {
        if (!cancelled) setGroups([]);
      } finally {
        if (!cancelled) setLoadingGroups(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, branchId]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const teacherNames = g.teachers
        .map((t) => `${t.firstName} ${t.lastName}`)
        .join(" ")
        .toLowerCase();
      return (
        g.name.toLowerCase().includes(q) ||
        teacherNames.includes(q) ||
        (g.course?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [groups, groupSearch]);

  function handleBranchChange(value: string) {
    setBranchId(value);
    setGroupId(null);
    setGroupSearch("");
  }

  async function handleConfirm() {
    if (!convertLead) return;
    setSubmitting(true);
    try {
      const payload: { branchId?: number; groupId?: string } = {};
      if (branchId) payload.branchId = Number(branchId);
      if (groupId) payload.groupId = groupId;
      await api.post<{ studentId: number; lead: LeadCard }>(
        `/leads/${convertLead.id}/convert`,
        payload,
      );
      // A converted lead leaves the funnel — drop its card from the board.
      applyLeadRemove(convertLead.sectionId, convertLead.id);
      toast.success(
        groupId
          ? "Lid o'quvchiga aylantirildi va guruhga qo'shildi"
          : "Lid o'quvchiga aylantirildi",
      );
      closeConvertLead();
    } catch (error) {
      toast.error(
        getErrorMessage(error, "O'quvchiga aylantirishda xatolik yuz berdi"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && !submitting && closeConvertLead()}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>O&apos;quvchiga aylantirish</DialogTitle>
          <DialogDescription>
            Lid ma&apos;lumotlari asosida yangi o&apos;quvchi yaratiladi va lid
            &laquo;O&apos;quvchiga aylangan&raquo; holatiga o&apos;tadi.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Branch */}
          <div className="space-y-1.5">
            <Label>Filial</Label>
            <Select value={branchId} onValueChange={handleBranchChange}>
              <SelectTrigger>
                <SelectValue placeholder="Filialni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={String(branch.id)}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Filialni keyinroq o&apos;quvchi sahifasida ham belgilash mumkin.
            </p>
          </div>

          {/* Group */}
          <div className="space-y-1.5">
            <Label>Guruh (ixtiyoriy)</Label>
            {!branchId ? (
              <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                Guruh tanlash uchun avval filialni tanlang.
              </p>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Guruh nomi yoki ustoz bo'yicha qidirish..."
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {loadingGroups ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-2 rounded-lg border p-3">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    ))
                  ) : filteredGroups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <Users className="mb-2 size-7 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        Bu filialda mos guruh topilmadi
                      </p>
                    </div>
                  ) : (
                    filteredGroups.map((group) => {
                      const isSelected = groupId === group.id;
                      const daysList = getDaysList(group.days, group.exactDays);
                      const timeLabel =
                        group.lessonStartTime && group.lessonEndTime
                          ? `${group.lessonStartTime} – ${group.lessonEndTime}`
                          : null;
                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() =>
                            setGroupId(isSelected ? null : group.id)
                          }
                          className={`w-full space-y-2 rounded-lg border p-3 text-left transition-all ${
                            isSelected
                              ? "border-blue-400 bg-blue-50/50 shadow-sm dark:border-blue-700 dark:bg-blue-950/20"
                              : "border-border hover:border-muted-foreground/30 hover:bg-muted/20"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold">
                              {group.name}
                            </span>
                            <Badge
                              variant="secondary"
                              className="h-4 shrink-0 px-1.5 text-[10px]"
                            >
                              <Users className="mr-0.5 size-2.5" />
                              {group.studentCount}
                            </Badge>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {group.course && (
                              <span className="truncate">{group.course.name}</span>
                            )}
                            {daysList.length > 0 && (
                              <span className="flex gap-1">
                                {daysList.map((d) => (
                                  <span
                                    key={d}
                                    className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-semibold"
                                  >
                                    {WEEKDAY_SHORT[d] ?? d}
                                  </span>
                                ))}
                              </span>
                            )}
                            {timeLabel && (
                              <span className="font-medium tabular-nums">
                                {timeLabel}
                              </span>
                            )}
                          </div>

                          {group.teachers.length > 0 && (
                            <p className="truncate text-xs text-muted-foreground">
                              {group.teachers
                                .map((t) => `${t.firstName} ${t.lastName}`)
                                .join(", ")}
                            </p>
                          )}
                        </button>
                      );
                    })
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Guruh tanlansa, o&apos;quvchi shu guruhga qo&apos;shiladi.
                  Tanlanmasa, keyinroq o&apos;quvchi sahifasida qo&apos;shsa
                  bo&apos;ladi.
                </p>
              </>
            )}
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            onClick={closeConvertLead}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            Aylantirish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
