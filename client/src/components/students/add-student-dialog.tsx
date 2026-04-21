"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search, Users, DoorOpen } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  addStudentSchema,
  type AddStudentFormValues,
} from "@/lib/schemas/student-schema";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { sortWeekdays, WEEKDAY_SHORT } from "@/lib/weekdays";
import type { Student } from "@/data/student-model";
import api from "@/lib/api";

function extractErrorMessage(err: unknown, fallback: string): string {
  const maybeAxios = err as {
    response?: { data?: { message?: string | string[] } };
  };
  const msg = maybeAxios?.response?.data?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  if (typeof msg === "string" && msg.length > 0) return msg;
  return fallback;
}

interface GroupTeacher {
  id: number;
  firstName: string;
  lastName: string;
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

function getDaysList(days: string | null, exactDays: string[]): string[] {
  if (exactDays.length > 0) return sortWeekdays(exactDays);
  if (days === "odd") return ODD_DAYS;
  if (days === "even") return EVEN_DAYS;
  return [];
}

interface AddStudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (student: Student) => void;
}

export function AddStudentDialog({
  open,
  onOpenChange,
  onCreated,
}: AddStudentDialogProps) {
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [groupSearch, setGroupSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<AddStudentFormValues>({
    resolver: zodResolver(addStudentSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      groupId: undefined,
    },
  });

  const selectedGroupId = form.watch("groupId");

  const fetchGroups = useCallback(async () => {
    if (!selectedBranch) return;
    setLoadingGroups(true);
    try {
      const params: Record<string, unknown> = {
        branch_id: selectedBranch.id,
        pageSize: 50,
      };
      if (groupSearch.trim()) params.search = groupSearch.trim();
      const { data } = await api.get("/groups", { params });
      const enrollable = (data.data || []).filter(
        (g: GroupOption) =>
          g.statusEnum === "ACTIVE" ||
          g.statusEnum === "FORMING" ||
          g.statusEnum === "PAUSED",
      );
      setGroups(enrollable);
    } catch {
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, [selectedBranch, groupSearch]);

  useEffect(() => {
    if (open) fetchGroups();
  }, [open, fetchGroups]);

  useEffect(() => {
    if (!open) {
      form.reset({
        firstName: "",
        lastName: "",
        phone: "",
        groupId: undefined,
      });
      setGroupSearch("");
    }
  }, [open, form]);

  const onSubmit = async (values: AddStudentFormValues) => {
    if (!selectedBranch) {
      toast.error("Avval filial tanlang");
      return;
    }
    setSubmitting(true);
    try {
      const { data: student } = await api.post<Student>("/students", {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        phone: values.phone,
        branchIds: [selectedBranch.id],
      });

      if (values.groupId) {
        try {
          await api.post(`/students/${student.id}/enroll`, {
            groupId: values.groupId,
          });
        } catch (enrollErr: unknown) {
          toast.error(
            extractErrorMessage(
              enrollErr,
              "O'quvchi yaratildi, lekin guruhga qo'shilmadi",
            ),
          );
          onCreated?.(student);
          onOpenChange(false);
          return;
        }
      }

      toast.success("O'quvchi muvaffaqiyatli qo'shildi");
      onCreated?.(student);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(extractErrorMessage(err, "O'quvchi qo'shishda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Yangi o&apos;quvchi qo&apos;shish</DialogTitle>
          <DialogDescription>
            Ism, familiya va telefon raqamini kiriting. Guruh tanlash ixtiyoriy.
          </DialogDescription>
        </DialogHeader>

        <form
          id="add-student-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-4 overflow-y-auto min-h-0"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="add-firstName">Ism</Label>
              <Input
                id="add-firstName"
                placeholder="Ism"
                autoComplete="off"
                {...form.register("firstName")}
              />
              {form.formState.errors.firstName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.firstName.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-lastName">Familiya</Label>
              <Input
                id="add-lastName"
                placeholder="Familiya"
                autoComplete="off"
                {...form.register("lastName")}
              />
              {form.formState.errors.lastName && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.lastName.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Telefon raqam</Label>
            <Controller
              control={form.control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  value={field.value}
                  onChange={field.onChange}
                  name={field.name}
                />
              )}
            />
            {form.formState.errors.phone && (
              <p className="text-xs text-destructive">
                {form.formState.errors.phone.message}
              </p>
            )}
          </div>

          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <Label>Guruh (ixtiyoriy)</Label>
              {selectedGroupId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => form.setValue("groupId", undefined)}
                >
                  Tozalash
                </Button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Guruh nomini qidirish..."
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex-1 overflow-y-auto min-h-0 max-h-64 space-y-2 pr-1">
              {loadingGroups ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-4 w-16 rounded-full" />
                    </div>
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))
              ) : groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Users className="size-8 text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Guruhlar topilmadi
                  </p>
                </div>
              ) : (
                groups.map((group) => {
                  const isSelected = selectedGroupId === group.id;
                  const daysList = getDaysList(group.days, group.exactDays);
                  const timeLabel =
                    group.lessonStartTime && group.lessonEndTime
                      ? `${group.lessonStartTime} – ${group.lessonEndTime}`
                      : null;
                  const intensive = group.course
                    ? isIntensive(group.course.name)
                    : false;

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
                      onClick={() =>
                        form.setValue(
                          "groupId",
                          isSelected ? undefined : group.id,
                        )
                      }
                      className={`flex w-full rounded-lg border text-left transition-all overflow-hidden ${
                        isSelected
                          ? selectedStyles
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/20"
                      }`}
                    >
                      <div
                        className={`w-1 shrink-0 transition-colors ${
                          isSelected ? accentColor : "bg-transparent"
                        }`}
                      />
                      <div className="flex-1 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-sm font-semibold truncate ${
                              isSelected ? nameColor : ""
                            }`}
                          >
                            {group.name}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1.5 shrink-0"
                          >
                            <Users className="mr-0.5 size-2.5" />
                            {group.studentCount}
                          </Badge>
                        </div>

                        {group.course && (
                          <div className="flex items-center gap-2">
                            <span
                              className={`shrink-0 rounded-md border px-2 py-0.5 text-xs font-bold ${
                                intensive
                                  ? "text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-950/30 dark:border-orange-800"
                                  : "text-blue-700 bg-blue-100 border-blue-200 dark:text-blue-400 dark:bg-blue-950/30 dark:border-blue-800"
                              }`}
                            >
                              {intensive ? "Intensiv" : "Standart"}
                            </span>
                            <span className="text-sm text-muted-foreground truncate">
                              {group.course.name}
                            </span>
                          </div>
                        )}

                        {(daysList.length > 0 || timeLabel) && (
                          <div className="flex items-center gap-2.5">
                            {daysList.length > 0 && (
                              <div className="flex gap-1">
                                {daysList.map((d) => (
                                  <span
                                    key={d}
                                    className="flex size-6 items-center justify-center rounded-md bg-muted text-[10px] font-semibold"
                                  >
                                    {WEEKDAY_SHORT[d] ?? d}
                                  </span>
                                ))}
                              </div>
                            )}
                            {timeLabel && (
                              <span className="text-sm font-bold tabular-nums tracking-tight">
                                {timeLabel}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3">
                          {group.teachers.length > 0 ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex -space-x-1.5 shrink-0">
                                {group.teachers.slice(0, 2).map((t) => (
                                  <Avatar
                                    key={t.id}
                                    className="size-5 border-2 border-background"
                                  >
                                    {t.photo && <AvatarImage src={t.photo} />}
                                    <AvatarFallback className="text-[7px] font-medium">
                                      {`${t.firstName?.[0] ?? ""}${t.lastName?.[0] ?? ""}`}
                                    </AvatarFallback>
                                  </Avatar>
                                ))}
                              </div>
                              <span className="text-xs text-muted-foreground truncate">
                                {group.teachers
                                  .map((t) => `${t.firstName} ${t.lastName}`)
                                  .join(", ")}
                              </span>
                            </div>
                          ) : (
                            <span />
                          )}
                          {group.room && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                              <DoorOpen className="size-3" />
                              {group.room.name}
                              {group.room.capacity != null && (
                                <span className="text-muted-foreground/60">
                                  ({group.room.capacity})
                                </span>
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
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            type="submit"
            form="add-student-form"
            disabled={submitting}
          >
            {submitting && <Loader2 className="mr-1.5 size-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
