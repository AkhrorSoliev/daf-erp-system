export interface RetentionMetrics {
  totalTeacherChanges: number;
  departedAfterTeacherChange: number;
}

export interface TeacherChangeRow {
  id: string;
  groupId: string;
  groupName: string;
  branchName: string;
  courseName: string;
  previousTeachers: string[];
  newTeachers: string[];
  changeType: "ADDED" | "REMOVED" | "REPLACED";
  triggeredByDismissal: boolean;
  changedAt: string;
  changedBy: string | null;
}

export interface DepartedAfterChangeRow {
  enrollmentId: string;
  studentId: number;
  studentName: string;
  groupId: string;
  groupName: string;
  branchName: string;
  teacherChangeAt: string;
  departedAt: string;
  lessonNumber: number;
  previousTeachers: string[];
  newTeachers: string[];
  departureReason: string | null;
}

export interface RetentionQueryParams {
  branchId?: number;
  courseId?: string;
  teacherIds?: string;
  startDate: string;
  endDate: string;
}

export const CHANGE_TYPE_LABELS: Record<
  TeacherChangeRow["changeType"],
  string
> = {
  ADDED: "Qo'shildi",
  REMOVED: "Olib tashlandi",
  REPLACED: "Almashtirildi",
};
