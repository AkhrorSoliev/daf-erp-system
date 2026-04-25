import type { EditGroupFormValues } from "@/lib/schemas/group-schema";
import type { GroupData } from "@/hooks/use-edit-group";

export interface CourseOption {
  id: string;
  name: string;
  courseDuration: number | null;
  lessonDuration: number | null;
  lessonMinutes: number | null;
  price: number;
}

/** Add `durationMinutes` to a `HH:MM` start time, returning the end time. */
export function calcEndTime(
  startTime: string,
  durationMinutes: number,
): string {
  const [h, m] = startTime.split(":").map(Number);
  const totalMin = h * 60 + m + durationMinutes;
  const endH = String(Math.floor(totalMin / 60) % 24).padStart(2, "0");
  const endM = String(totalMin % 60).padStart(2, "0");
  return `${endH}:${endM}`;
}

/** Map a Group entity (or null for "add" mode) to react-hook-form defaults. */
export function groupToForm(group: GroupData | null): EditGroupFormValues {
  if (!group) {
    return {
      name: "",
      level: "",
      courseId: "",
      roomId: "",
      exactDays: [],
      lessonStartTime: "",
      lessonEndTime: "",
      lessonMinutes: undefined,
      status: 2,
      startDate: undefined,
      comment: "",
      teacherId: undefined,
    };
  }
  return {
    name: group.name,
    level: group.level ?? "",
    courseId: group.course.id,
    roomId: group.room?.id ?? "",
    exactDays: group.exactDays ?? [],
    lessonStartTime: group.lessonStartTime ?? "",
    lessonEndTime: group.lessonEndTime ?? "",
    lessonMinutes: group.lessonMinutes ?? undefined,
    status: group.status,
    startDate: group.startDate ? new Date(group.startDate) : undefined,
    comment: group.comment ?? "",
    teacherId: group.teachers[0]?.id,
  };
}
