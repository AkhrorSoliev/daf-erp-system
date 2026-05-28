export interface OutreachStudent {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  photo: string | null;
}

export interface OutreachStudentWithParent extends OutreachStudent {
  parentPhone: string | null;
}

export interface OutreachGroupSummary {
  id: string;
  name: string;
  course: { id: string; name: string } | null;
  branch: { id: number; name: string } | null;
}

export interface OutreachTeacher {
  id: number;
  firstName: string;
  lastName: string;
}

export interface TodayAbsenteesResponse {
  date: string;
  total: number;
  items: TodayAbsenteeItem[];
}

export interface TodayAbsenteeItem {
  attendanceId: string;
  note: string | null;
  student: OutreachStudent;
  group: OutreachGroupSummary & {
    lessonStartTime: string | null;
    lessonEndTime: string | null;
  };
  teacher: OutreachTeacher | null;
}

export interface CallbackEntityLead {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
}

export interface CallbackEntityStudent {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  photo: string | null;
}

export interface CallbackItem {
  commentId: string;
  assigneeStatus: "PENDING" | "SEEN" | "DONE";
  dueDate: string;
  isOverdue: boolean;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" | null;
  text: string;
  entityType: string;
  entityId: string;
  entity: CallbackEntityLead | CallbackEntityStudent | null;
  author: { id: number; firstName: string; lastName: string };
}

export interface CallbacksResponse {
  total: number;
  page: number;
  pageSize: number;
  items: CallbackItem[];
}

export interface RemovalQueueItem {
  enrollmentId: string;
  consecutiveAbsentCount: number;
  lastAbsenceDate: string;
  // Oxirgi marta PRESENT/LATE bo'lgan dars sanasi (null = hech qachon
  // kelmagan).
  lastPresentDate: string | null;
  student: OutreachStudentWithParent;
  group: OutreachGroupSummary;
  teacher: OutreachTeacher | null;
}

export interface RemovalQueueResponse {
  total: number;
  items: RemovalQueueItem[];
}

export interface OutreachStats {
  todayAbsentees: number;
  pendingCallbacks: number;
  overdueCallbacks: number;
  removalQueue: number;
}
