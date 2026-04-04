"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { ChevronsUpDown, Loader2, Search, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import {
  editGroupSchema,
  addGroupSchema,
  type EditGroupFormValues,
} from "@/lib/schemas/group-schema";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useScheduleAvailability } from "@/hooks/use-schedule-availability";
import api from "@/lib/api";

interface CourseOption {
  id: string;
  name: string;
  courseDuration: number | null;
  lessonDuration: number | null;
  lessonMinutes: number | null;
  price: number;
}


const WEEKDAYS = [
  { value: "monday", label: "Du" },
  { value: "tuesday", label: "Se" },
  { value: "wednesday", label: "Chor" },
  { value: "thursday", label: "Pay" },
  { value: "friday", label: "Ju" },
  { value: "saturday", label: "Sha" },
];

const ODD_DAYS = ["monday", "wednesday", "friday"];
const EVEN_DAYS = ["tuesday", "thursday", "saturday"];
const EVERY_DAY = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function calcEndTime(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
  const endM = String(totalMin % 60).padStart(2, "0");
  return `${endH}:${endM}`;
}

interface EditGroupFormProps {
  group: GroupData | null;
  isAdd?: boolean;
  onClose: () => void;
  onSaved?: (updated: GroupData) => void;
  formId: string;
}

function groupToForm(group: GroupData | null): EditGroupFormValues {
  if (!group) {
    return {
      name: "",
      level: "",
      courseId: "",
      roomId: "",
      exactDays: [],
      lessonStartTime: "",
      lessonEndTime: "",
      status: 2,
      startDate: undefined,
      comment: "",
      teacherId: undefined,
    };
  }
  return {
    name: group.name,
    level: group.course.level ?? "",
    courseId: group.course.id,
    roomId: group.room?.id ?? "",
    exactDays: group.exactDays ?? [],
    lessonStartTime: group.lessonStartTime ?? "",
    lessonEndTime: group.lessonEndTime ?? "",
    status: group.status,
    startDate: group.startDate ? new Date(group.startDate) : undefined,
    comment: group.comment ?? "",
    teacherId: group.teachers[0]?.id,
  };
}

export function EditGroupForm({
  group,
  isAdd = false,
  onClose,
  onSaved,
  formId,
}: EditGroupFormProps) {
  const { setSubmitting, setHasConflict } = useEditGroup();
  const selectedBranch = useBranchSwitcher((s) => s.selectedBranch);

  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestedName, setSuggestedName] = useState("");
  const [dayPreset, setDayPreset] = useState(() => {
    const days = group?.exactDays ?? [];
    if (!days.length) return "";
    const sorted = [...days].sort().join(",");
    if (sorted === [...ODD_DAYS].sort().join(",")) return "odd";
    if (sorted === [...EVEN_DAYS].sort().join(",")) return "even";
    if (sorted === [...EVERY_DAY].sort().join(",")) return "every";
    return "custom";
  });
  const [teacherPopoverOpen, setTeacherPopoverOpen] = useState(false);
  const [teacherSearch, setTeacherSearch] = useState("");

  const form = useForm<EditGroupFormValues>({
    resolver: zodResolver(isAdd ? addGroupSchema : editGroupSchema) as any,
    defaultValues: groupToForm(group),
  });

  const fetchOptions = useCallback(async () => {
    const branchId = selectedBranch?.id;
    if (!branchId) return;

    setLoading(true);
    try {
      const coursesRes = await api.get("/courses", { params: { branch_id: branchId, pageSize: 100 } });
      setCourses(coursesRes.data.data ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [selectedBranch]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  const watchedCourseId = form.watch("courseId");
  const watchedStartTime = form.watch("lessonStartTime");
  const watchedLevel = form.watch("level");
  const watchedTeacherId = form.watch("teacherId");
  const watchedRoomId = form.watch("roomId");
  const watchedExactDays = form.watch("exactDays");

  const selectedCourse = useMemo(
    () => courses.find((c) => c.id === watchedCourseId),
    [courses, watchedCourseId],
  );

  // Smart availability hook — rooms & teachers filtered by schedule
  const { rooms: smartRooms, teachers: smartTeachers } = useScheduleAvailability({
    branchId: selectedBranch?.id,
    exactDays: watchedExactDays ?? [],
    startTime: watchedStartTime ?? "",
    endTime: form.watch("lessonEndTime") ?? "",
    excludeGroupId: group?.id,
  });

  const selectedTeacher = useMemo(
    () => smartTeachers.find((t) => t.id === watchedTeacherId),
    [smartTeachers, watchedTeacherId],
  );

  const filteredTeachers = useMemo(
    () =>
      teacherSearch.trim()
        ? smartTeachers.filter((t) =>
            `${t.firstName} ${t.lastName}`.toLowerCase().includes(teacherSearch.toLowerCase()),
          )
        : smartTeachers,
    [smartTeachers, teacherSearch],
  );

  // Reset room/teacher if they become unavailable after schedule change
  useEffect(() => {
    if (watchedRoomId && smartRooms.length > 0) {
      const room = smartRooms.find((r) => r.id === watchedRoomId);
      if (room && !room.available) {
        form.setValue("roomId", "");
      }
    }
  }, [smartRooms, watchedRoomId, form]);

  useEffect(() => {
    if (watchedTeacherId && smartTeachers.length > 0) {
      const teacher = smartTeachers.find((t) => t.id === watchedTeacherId);
      if (teacher && !teacher.available) {
        form.setValue("teacherId", undefined);
      }
    }
  }, [smartTeachers, watchedTeacherId, form]);

  // Fetch suggested name only when adding a new group
  useEffect(() => {
    if (!isAdd || !selectedBranch?.id) {
      setSuggestedName("");
      return;
    }
    api
      .get("/groups/next-name", {
        params: { branchId: selectedBranch.id },
      })
      .then((res) => setSuggestedName(res.data.nextName))
      .catch(() => setSuggestedName(""));
  }, [isAdd, selectedBranch?.id]);

  // Auto-calculate endTime using lessonMinutes
  useEffect(() => {
    if (watchedStartTime && selectedCourse?.lessonMinutes) {
      const endTime = calcEndTime(watchedStartTime, selectedCourse.lessonMinutes);
      form.setValue("lessonEndTime", endTime);
    }
  }, [watchedStartTime, selectedCourse, form]);

  // Smart selects prevent conflicts — no need for separate conflict check
  useEffect(() => {
    setHasConflict(false);
  }, [setHasConflict]);

  const branchStartTime = selectedBranch?.startOfWorkingDay ?? undefined;
  const branchEndTime = selectedBranch?.endOfWorkingDay ?? undefined;

  // maxTime for start time picker: ensure lesson end doesn't exceed branch closing
  const startTimeMax = useMemo(() => {
    if (!branchEndTime) return undefined;
    if (!selectedCourse?.lessonMinutes) return branchEndTime;
    const [h, m] = branchEndTime.split(":").map(Number);
    const totalMin = h * 60 + m - selectedCourse.lessonMinutes;
    if (totalMin < 0) return branchEndTime;
    const endH = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
    const endM = String(totalMin % 60).padStart(2, "0");
    return `${endH}:${endM}`;
  }, [branchEndTime, selectedCourse?.lessonMinutes]);

  const onSubmit = async (values: EditGroupFormValues) => {
    setSubmitting(true);
    try {
      const payload: any = {
        courseId: values.courseId,
        branchId: selectedBranch?.id,
      };
      if (values.name) payload.name = values.name;
      if (isAdd && values.level) payload.level = values.level;
      if (values.teacherId) payload.teacherIds = [values.teacherId];
      if (values.roomId) payload.roomId = values.roomId;
      if (values.exactDays?.length) payload.exactDays = values.exactDays;
      if (values.lessonStartTime) payload.lessonStartTime = values.lessonStartTime;
      if (values.lessonEndTime) payload.lessonEndTime = values.lessonEndTime;
      if (values.status) payload.status = values.status;
      if (values.startDate) payload.startDate = values.startDate.toISOString();
      if (values.comment) payload.comment = values.comment;

      if (isAdd) {
        const companyId = localStorage.getItem("companyId");
        if (companyId) payload.companyId = Number(companyId);
        const { data } = await api.post("/groups", payload);
        toast.success("Guruh muvaffaqiyatli qo'shildi");
        onSaved?.(data);
      } else if (group) {
        const { data } = await api.patch(`/groups/${group.id}`, payload);
        toast.success("Guruh muvaffaqiyatli yangilandi");
        onSaved?.(data);
      }
      onClose();
    } catch (error: any) {
      const msg =
        error?.response?.data?.message || "Saqlashda xatolik yuz berdi";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="text-muted-foreground size-6 animate-spin" />
      </div>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={form.handleSubmit(onSubmit)}
      className="space-y-6 p-6"
    >
      {/* Asosiy ma'lumotlar */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Asosiy ma&apos;lumotlar</h3>

        {/* Daraja select */}
        <div className="space-y-2">
          <Label>Daraja</Label>
          <Controller
            name="level"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value || ""} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Darajani tanlang" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                  <SelectItem value="A1">A1</SelectItem>
                  <SelectItem value="A2">A2</SelectItem>
                  <SelectItem value="B1">B1</SelectItem>
                  <SelectItem value="B2">B2</SelectItem>
                  <SelectItem value="C1">C1</SelectItem>
                  <SelectItem value="C2">C2</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.level && (
            <p className="text-destructive text-sm">
              {form.formState.errors.level.message}
            </p>
          )}
        </div>

        {/* Suggested name */}
        {suggestedName && (
          <div className="space-y-2">
            <Label>Guruh nomi</Label>
            <div className="bg-muted flex h-9 items-center rounded-md border px-3 text-sm font-medium">
              {suggestedName}
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                (avtomatik)
              </span>
            </div>
          </div>
        )}

        {/* Edit mode: show existing name */}
        {!isAdd && group?.name && !suggestedName && (
          <div className="space-y-2">
            <Label>Guruh nomi</Label>
            <div className="bg-muted text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm">
              {group.name}
            </div>
          </div>
        )}

        {/* Kurs select */}
        <div className="space-y-2">
          <Label htmlFor="courseId">Kurs</Label>
          <Controller
            name="courseId"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="courseId" className="w-full">
                  <SelectValue placeholder="Kursni tanlang" />
                </SelectTrigger>
                <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.courseDuration ? ` (${c.courseDuration} oy)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {form.formState.errors.courseId && (
            <p className="text-destructive text-sm">
              {form.formState.errors.courseId.message}
            </p>
          )}
        </div>

      </div>

      {/* Jadval */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Jadval</h3>

        <div className="space-y-2">
          <Label>Dars kunlari</Label>
          <Select
            value={dayPreset}
            onValueChange={(v) => {
              setDayPreset(v);
              if (v === "odd") form.setValue("exactDays", ODD_DAYS);
              else if (v === "even") form.setValue("exactDays", EVEN_DAYS);
              else if (v === "every") form.setValue("exactDays", EVERY_DAY);
              else if (v === "custom") form.setValue("exactDays", []);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Kunlarni tanlang" />
            </SelectTrigger>
            <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
              <SelectItem value="odd">Toq kunlar (Du, Chor, Ju)</SelectItem>
              <SelectItem value="even">Juft kunlar (Se, Pay, Sha)</SelectItem>
              <SelectItem value="every">Har kun (Du–Ju)</SelectItem>
              <SelectItem value="custom">Boshqa</SelectItem>
            </SelectContent>
          </Select>

          {dayPreset === "custom" && (
            <Controller
              name="exactDays"
              control={form.control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-3 pt-1">
                  {WEEKDAYS.map((day) => {
                    const checked = field.value?.includes(day.value) ?? false;
                    return (
                      <label
                        key={day.value}
                        className="flex items-center gap-1.5 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(c) => {
                            const current = field.value ?? [];
                            field.onChange(
                              c
                                ? [...current, day.value]
                                : current.filter((d) => d !== day.value),
                            );
                          }}
                        />
                        {day.label}
                      </label>
                    );
                  })}
                </div>
              )}
            />
          )}

          {form.formState.errors.exactDays && (
            <p className="text-destructive text-sm">
              {form.formState.errors.exactDays.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Dars boshlanish vaqti</Label>
          <Controller
            name="lessonStartTime"
            control={form.control}
            render={({ field }) => (
              <TimePicker
                value={field.value || undefined}
                onChange={field.onChange}
                placeholder="Boshlanish vaqtini tanlang"
                minTime={branchStartTime}
                maxTime={startTimeMax}
              />
            )}
          />
          {form.formState.errors.lessonStartTime && (
            <p className="text-destructive text-sm">
              {form.formState.errors.lessonStartTime.message}
            </p>
          )}
        </div>

        {watchedStartTime && selectedCourse?.lessonMinutes && (
          <div className="space-y-2">
            <Label>Tugash vaqti</Label>
            <div className="bg-muted text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm">
              {calcEndTime(watchedStartTime, selectedCourse.lessonMinutes)}
              <span className="ml-2 text-xs">
                (avtomatik — {selectedCourse.lessonMinutes} daqiqa)
              </span>
            </div>
          </div>
        )}

        {/* Smart Xona select */}
        <div className="space-y-2">
          <Label>Xona</Label>
          {smartRooms.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
              Hozircha xona yo&apos;q
            </p>
          ) : (
            <Controller
              name="roomId"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={field.value || "none"}
                  onValueChange={(v) => field.onChange(v === "none" ? "" : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Xonani tanlang" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                    <SelectItem value="none">Tanlanmagan</SelectItem>
                    {smartRooms.map((r) => (
                      <SelectItem key={r.id} value={r.id} disabled={!r.available}>
                        {r.name}
                        {r.capacity ? ` (${r.capacity})` : ""}
                        {!r.available && r.busyGroup ? ` — ${r.busyGroup} band` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </div>

        {/* Smart O'qituvchi select */}
        <div className="space-y-2">
          <Label>O&apos;qituvchi</Label>
          {smartTeachers.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2 text-sm">
              Hozircha o&apos;qituvchi yo&apos;q
            </p>
          ) : (
            <Controller
              name="teacherId"
              control={form.control}
              render={({ field }) => (
                <Popover
                  modal
                  open={teacherPopoverOpen}
                  onOpenChange={(open) => {
                    setTeacherPopoverOpen(open);
                    if (!open) setTeacherSearch("");
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        type="button"
                        className="min-w-0 flex-1 justify-between font-normal"
                      >
                        {selectedTeacher ? (
                          <span className="flex items-center gap-2">
                            <Avatar size="sm">
                              {selectedTeacher.photo && (
                                <AvatarImage src={selectedTeacher.photo} alt={`${selectedTeacher.firstName} ${selectedTeacher.lastName}`} />
                              )}
                              <AvatarFallback>
                                {`${selectedTeacher.firstName[0] ?? ''}${selectedTeacher.lastName[0] ?? ''}`.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            {selectedTeacher.firstName} {selectedTeacher.lastName}
                          </span>
                        ) : (
                          "O'qituvchini tanlang"
                        )}
                        <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    {selectedTeacher && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 shrink-0"
                        onClick={() => field.onChange(undefined)}
                      >
                        <X className="size-4" />
                      </Button>
                    )}
                  </div>
                  <PopoverContent className="w-72 gap-0 p-0" align="start">
                    <div className="border-b p-2">
                      <div className="relative">
                        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
                        <Input
                          placeholder="Qidirish..."
                          value={teacherSearch}
                          onChange={(e) => setTeacherSearch(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                    </div>
                    <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain p-2">
                      {filteredTeachers.map((t) => {
                        const isSelected = field.value === t.id;
                        const fullName = `${t.firstName} ${t.lastName}`;
                        const initials = `${t.firstName[0] ?? ''}${t.lastName[0] ?? ''}`.toUpperCase();
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={!t.available}
                            onClick={() => {
                              if (!t.available) return;
                              field.onChange(isSelected ? undefined : t.id);
                              setTeacherPopoverOpen(false);
                              setTeacherSearch("");
                            }}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                              !t.available && "opacity-50 cursor-not-allowed",
                              t.available && "hover:bg-accent",
                              isSelected && "bg-accent",
                            )}
                          >
                            <Avatar size="sm">
                              {t.photo && <AvatarImage src={t.photo} alt={fullName} />}
                              <AvatarFallback>{initials}</AvatarFallback>
                            </Avatar>
                            <span className="truncate flex-1 text-left">{fullName}</span>
                            {!t.available && t.busyGroup && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{t.busyGroup}</span>
                            )}
                          </button>
                        );
                      })}
                      {filteredTeachers.length === 0 && (
                        <p className="text-muted-foreground px-2 py-1.5 text-sm">
                          O&apos;qituvchilar topilmadi
                        </p>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            />
          )}
        </div>
      </div>

      {/* Sana va holat */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Sana va holat</h3>

        <div className="space-y-2">
          <Label>Boshlanish sanasi</Label>
          <Controller
            name="startDate"
            control={form.control}
            render={({ field }) => (
              <DatePicker
                value={field.value}
                onChange={field.onChange}
                placeholder="Sanani tanlang"
              />
            )}
          />
        </div>

        {!isAdd && (
          <div className="space-y-2">
            <Label htmlFor="status">Holat</Label>
            <Controller
              name="status"
              control={form.control}
              render={({ field }) => (
                <Select
                  value={String(field.value ?? 2)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Faol</SelectItem>
                    <SelectItem value="2">Boshlanmagan</SelectItem>
                    <SelectItem value="3">Pauza</SelectItem>
                    <SelectItem value="4">To&apos;xtatilgan</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="comment">Izoh</Label>
          <Textarea
            id="comment"
            placeholder="Qo'shimcha izoh..."
            rows={3}
            {...form.register("comment")}
          />
        </div>
      </div>
    </form>
  );
}
