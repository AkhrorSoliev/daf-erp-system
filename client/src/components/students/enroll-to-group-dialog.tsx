"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  Search,
  Users,
  DoorOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";

interface GroupTeacher {
  id: number;
  name: string;
  photo: string | null;
}

interface GroupOption {
  id: string;
  name: string;
  statusEnum: string;
  course: { name: string } | null;
  room: { name: string; capacity: number | null } | null;
  teachers: GroupTeacher[];
  studentCount: number;
  lessonStartTime: string | null;
  lessonEndTime: string | null;
  days: string | null;
  exactDays: string[];
}

function isIntensive(courseName: string): boolean {
  return /intensiv/i.test(courseName);
}

const ODD_DAYS = ["monday", "wednesday", "friday"];
const EVEN_DAYS = ["tuesday", "thursday", "saturday"];

const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Du",
  tuesday: "Se",
  wednesday: "Cho",
  thursday: "Pa",
  friday: "Ju",
  saturday: "Sha",
};

function getDaysList(days: string | null, exactDays: string[]): string[] {
  if (exactDays.length > 0) return exactDays;
  if (days === "odd") return ODD_DAYS;
  if (days === "even") return EVEN_DAYS;
  return [];
}

interface EnrollToGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number;
  studentName: string;
  enrolledGroupIds: string[];
  onEnrolled?: () => void;
}

export function EnrollToGroupDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  enrolledGroupIds,
  onEnrolled,
}: EnrollToGroupDialogProps) {
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const fetchGroups = useCallback(async () => {
    if (!selectedBranch) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {
        branch_id: selectedBranch.id,
        pageSize: 50,
      };
      if (search.trim()) params.search = search.trim();
      const { data } = await api.get("/groups", { params });
      const activeGroups = (data.data || []).filter(
        (g: any) => g.statusEnum === "ACTIVE" || g.statusEnum === "FORMING",
      );
      setGroups(activeGroups);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [selectedBranch?.id, search]);

  useEffect(() => {
    if (open) fetchGroups();
  }, [open, fetchGroups]);

  useEffect(() => {
    if (open) {
      setSelectedId(null);
      setSearch("");
    }
  }, [open]);

  const handleEnroll = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await api.post(`/students/${studentId}/enroll`, { groupId: selectedId });
      toast.success("O'quvchi guruhga qo'shildi");
      onEnrolled?.();
      onOpenChange(false);
    } catch (err: any) {
      const msg = err?.response?.data?.message || "Guruhga qo'shishda xatolik";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Enrolled guruhlar tepada, qolganlari pastda
  const sortedGroups = [...groups].sort((a, b) => {
    const aEnrolled = enrolledGroupIds.includes(a.id) ? 0 : 1;
    const bEnrolled = enrolledGroupIds.includes(b.id) ? 0 : 1;
    return aEnrolled - bEnrolled;
  });

  const hasGroup = enrolledGroupIds.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{hasGroup ? "Guruhni o'zgartirish" : "Guruhga qo'shish"}</DialogTitle>
          <DialogDescription>
            <strong>{studentName}</strong> uchun guruh tanlang
          </DialogDescription>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Guruh nomini qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Groups list */}
        <div className="flex-1 overflow-y-auto min-h-0 max-h-96 space-y-2 pr-1">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-40" />
              </div>
            ))
          ) : sortedGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Users className="size-8 text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">
                Guruhlar topilmadi
              </p>
            </div>
          ) : (
            sortedGroups.map((group) => {
              const isEnrolled = enrolledGroupIds.includes(group.id);
              const isSelected = !isEnrolled && selectedId === group.id;
              const daysList = getDaysList(group.days, group.exactDays);
              const timeLabel =
                group.lessonStartTime && group.lessonEndTime
                  ? `${group.lessonStartTime} – ${group.lessonEndTime}`
                  : null;

              const intensive = group.course ? isIntensive(group.course.name) : false;

              const selectedStyles = intensive
                ? "border-orange-400 bg-orange-50/50 shadow-sm dark:border-orange-700 dark:bg-orange-950/20"
                : "border-blue-400 bg-blue-50/50 shadow-sm dark:border-blue-700 dark:bg-blue-950/20";

              const accentColor = intensive
                ? "bg-orange-500 dark:bg-orange-400"
                : "bg-blue-500 dark:bg-blue-400";

              const nameColor = intensive
                ? "text-orange-700 dark:text-orange-400"
                : "text-blue-700 dark:text-blue-400";

              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => !isEnrolled && setSelectedId(selectedId === group.id ? null : group.id)}
                  className={`flex w-full rounded-lg border text-left transition-all overflow-hidden ${
                    isEnrolled
                      ? "border-border bg-muted/30 opacity-60 cursor-default"
                      : isSelected
                        ? selectedStyles
                        : "border-border hover:border-muted-foreground/30 hover:bg-muted/20"
                  }`}
                >
                  {/* Left accent bar */}
                  <div className={`w-1 shrink-0 transition-colors ${
                    isSelected ? accentColor : "bg-transparent"
                  }`} />

                  {/* Content */}
                  <div className="flex-1 p-3 space-y-2.5">
                    {/* Row 1: Group name + enrolled badge + student count */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-sm font-semibold truncate ${
                          isSelected ? nameColor : ""
                        }`}>
                          {group.name}
                        </span>
                        {isEnrolled && (
                          <Badge className="h-4 px-1.5 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:border-emerald-800">
                            Qo&apos;shilgan
                          </Badge>
                        )}
                      </div>
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                        <Users className="mr-0.5 size-2.5" />
                        {group.studentCount}
                      </Badge>
                    </div>

                    {/* Row 2: Course type + name */}
                    {group.course && (() => {
                      const intensive = isIntensive(group.course.name);
                      return (
                        <div className="flex items-center gap-2">
                          <span className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold ${
                            intensive
                              ? "text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-800"
                              : "text-blue-700 bg-blue-100 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800"
                          }`}>
                            {intensive ? "Intensiv" : "Standart"}
                          </span>
                          <span className="text-sm text-muted-foreground truncate">{group.course.name}</span>
                        </div>
                      );
                    })()}

                    {/* Row 2: Schedule — days + time, prominent */}
                    {(daysList.length > 0 || timeLabel) && (
                      <div className="flex items-center gap-2.5">
                        {daysList.length > 0 && (
                          <div className="flex gap-1">
                            {daysList.map((d) => (
                              <span
                                key={d}
                                className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold"
                              >
                                {WEEKDAY_SHORT[d] ?? d}
                              </span>
                            ))}
                          </div>
                        )}
                        {timeLabel && (
                          <span className="text-base font-bold tabular-nums tracking-tight">
                            {timeLabel}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Row 3: Teacher + Room */}
                    <div className="flex items-center justify-between gap-3">
                      {/* Teacher */}
                      {group.teachers.length > 0 ? (
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex -space-x-1.5 shrink-0">
                            {group.teachers.slice(0, 2).map((t) => (
                              <Avatar key={t.id} className="size-5 border-2 border-background">
                                {t.photo && <AvatarImage src={t.photo} />}
                                <AvatarFallback className="text-[7px] font-medium">
                                  {t.name.slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground truncate">
                            {group.teachers.map((t) => t.name).join(", ")}
                          </span>
                        </div>
                      ) : (
                        <span />
                      )}

                      {/* Room + capacity */}
                      {group.room && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                          <DoorOpen className="size-3" />
                          {group.room.name}
                          {group.room.capacity != null && (
                            <span className="text-muted-foreground/60">({group.room.capacity})</span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button onClick={handleEnroll} disabled={!selectedId || submitting}>
            {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            {hasGroup ? "O'zgartirish" : "Qo'shish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
