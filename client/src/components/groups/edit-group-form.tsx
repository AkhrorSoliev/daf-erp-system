"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { GroupRoomSelect } from "./group-room-select";
import { GroupTeacherSelect } from "./group-teacher-select";
import { GroupDaysPicker } from "./group-days-picker";
import { GroupLevelSelect } from "./group-level-select";
import { GroupLessonDurationSelect } from "./group-lesson-duration-select";
import { GroupCourseSelect } from "./group-course-select";
import {
  calcEndTime,
  groupToForm,
  type CourseOption,
} from "./edit-group-form-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  editGroupSchema,
  addGroupSchema,
  type EditGroupFormValues,
} from "@/lib/schemas/group-schema";
import { useEditGroup, type GroupData } from "@/hooks/use-edit-group";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { useScheduleAvailability } from "@/hooks/use-schedule-availability";
import api from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

interface EditGroupFormProps {
  group: GroupData | null;
  isAdd?: boolean;
  onClose: () => void;
  onSaved?: (updated: GroupData) => void;
  formId: string;
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

  const watchedLessonMinutes = form.watch("lessonMinutes");
  const effectiveLessonMinutes = watchedLessonMinutes ?? selectedCourse?.lessonMinutes ?? null;

  // Teacher change detection — only applies when editing an existing group.
  const originalTeacherId = group?.teachers[0]?.id;
  const teacherChanged =
    !isAdd && !!originalTeacherId && watchedTeacherId !== originalTeacherId;

  const [changeReasonId, setChangeReasonId] = useState<string | undefined>();
  const { data: changeReasonOptions = [] } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ["group-teacher-change-reasons"],
    queryFn: () =>
      api
        .get<{ id: string; name: string }[]>("/group-teacher-change-reasons")
        .then((r) => r.data),
    enabled: teacherChanged,
    staleTime: 60_000,
  });

  // Reset reason selection when teacher goes back to original (no change anymore).
  useEffect(() => {
    if (!teacherChanged) setChangeReasonId(undefined);
  }, [teacherChanged]);

  // Auto-calculate endTime using effectiveLessonMinutes
  useEffect(() => {
    if (watchedStartTime && effectiveLessonMinutes) {
      const endTime = calcEndTime(watchedStartTime, effectiveLessonMinutes);
      form.setValue("lessonEndTime", endTime);
    }
  }, [watchedStartTime, effectiveLessonMinutes, form]);

  // Smart selects prevent conflicts — no need for separate conflict check
  useEffect(() => {
    setHasConflict(false);
  }, [setHasConflict]);

  const branchStartTime = selectedBranch?.startOfWorkingDay ?? undefined;
  const branchEndTime = selectedBranch?.endOfWorkingDay ?? undefined;

  // maxTime for start time picker: ensure lesson end doesn't exceed branch closing
  const startTimeMax = useMemo(() => {
    if (!branchEndTime) return undefined;
    if (!effectiveLessonMinutes) return branchEndTime;
    const [h, m] = branchEndTime.split(":").map(Number);
    const totalMin = h * 60 + m - effectiveLessonMinutes;
    if (totalMin < 0) return branchEndTime;
    const endH = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
    const endM = String(totalMin % 60).padStart(2, "0");
    return `${endH}:${endM}`;
  }, [branchEndTime, effectiveLessonMinutes]);

  const onSubmit = async (values: EditGroupFormValues) => {
    setSubmitting(true);
    try {
      const payload: any = {
        courseId: values.courseId,
        branchId: selectedBranch?.id,
      };
      if (values.name) payload.name = values.name;
      if (values.level) payload.level = values.level;
      if (values.teacherId) payload.teacherIds = [values.teacherId];
      if (teacherChanged && changeReasonId) {
        payload.changeReasonId = changeReasonId;
      }
      if (values.roomId) payload.roomId = values.roomId;
      if (values.exactDays?.length) payload.exactDays = values.exactDays;
      if (values.lessonStartTime) payload.lessonStartTime = values.lessonStartTime;
      if (values.lessonEndTime) payload.lessonEndTime = values.lessonEndTime;
      payload.lessonMinutes = values.lessonMinutes ?? null;
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
    } catch (error) {
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi"));
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
        <Controller
          name="level"
          control={form.control}
          render={({ field }) => (
            <GroupLevelSelect
              value={field.value ?? ""}
              onChange={field.onChange}
              error={form.formState.errors.level?.message}
            />
          )}
        />

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
        <Controller
          name="courseId"
          control={form.control}
          render={({ field }) => (
            <GroupCourseSelect
              value={field.value}
              onChange={field.onChange}
              courses={courses}
              error={form.formState.errors.courseId?.message}
            />
          )}
        />

        {/* Dars davomiyligi */}
        {selectedCourse && (
          <Controller
            name="lessonMinutes"
            control={form.control}
            render={({ field }) => (
              <GroupLessonDurationSelect
                value={field.value ?? undefined}
                onChange={field.onChange}
                defaultLessonMinutes={selectedCourse.lessonMinutes}
              />
            )}
          />
        )}

      </div>

      {/* Jadval */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Jadval</h3>

        <Controller
          name="exactDays"
          control={form.control}
          render={({ field }) => (
            <GroupDaysPicker
              value={field.value ?? []}
              onChange={field.onChange}
              error={form.formState.errors.exactDays?.message}
            />
          )}
        />

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

        {watchedStartTime && effectiveLessonMinutes && (
          <div className="space-y-2">
            <Label>Tugash vaqti</Label>
            <div className="bg-muted text-muted-foreground flex h-9 items-center rounded-md border px-3 text-sm">
              {calcEndTime(watchedStartTime, effectiveLessonMinutes)}
              <span className="ml-2 text-xs">
                (avtomatik — {effectiveLessonMinutes} daqiqa)
              </span>
            </div>
          </div>
        )}

        {/* Smart Xona select */}
        <div className="space-y-2">
          <Label>Xona</Label>
          <Controller
            name="roomId"
            control={form.control}
            render={({ field }) => (
              <GroupRoomSelect
                value={field.value ?? ""}
                onChange={field.onChange}
                rooms={smartRooms}
              />
            )}
          />
        </div>

        {/* Smart O'qituvchi select */}
        <div className="space-y-2">
          <Label>O&apos;qituvchi</Label>
          <Controller
            name="teacherId"
            control={form.control}
            render={({ field }) => (
              <GroupTeacherSelect
                value={field.value}
                onChange={field.onChange}
                teachers={smartTeachers}
              />
            )}
          />
          {teacherChanged && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3">
              <Label className="text-xs text-muted-foreground">
                Ustoz o&apos;zgartirilmoqda — sababi (ixtiyoriy)
              </Label>
              <Select
                value={changeReasonId ?? "__none__"}
                onValueChange={(v) =>
                  setChangeReasonId(v === "__none__" ? undefined : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sabab tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    Sababsiz (ko&apos;rsatilmagan)
                  </SelectItem>
                  {changeReasonOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
