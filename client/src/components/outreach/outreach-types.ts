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
  // Bu o'quvchiga ko'rilayotgan sanada qo'ng'iroq qilinganmi.
  calledToday: boolean;
  student: OutreachStudent;
  group: OutreachGroupSummary & {
    lessonStartTime: string | null;
    lessonEndTime: string | null;
  };
  teacher: OutreachTeacher | null;
}

// Qo'ng'iroq sababi (qaysi ro'yxatdan chiqilgan) va natijasi.
export type CallReason = "ABSENCE" | "DEBT" | "REMOVAL" | "OTHER";
export type CallOutcome =
  | "ANSWERED"
  | "NO_ANSWER"
  | "PROMISED" // legacy combined "keladi / to'laydi"
  | "WILL_COME"
  | "WILL_PAY"
  | "LEFT";

export interface CallLogItem {
  id: string;
  reason: CallReason;
  outcome: CallOutcome;
  note: string | null;
  createdAt: string;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string | null;
  };
  calledBy: { id: number; firstName: string; lastName: string };
}

export interface CallLogsResponse {
  total: number;
  page: number;
  pageSize: number;
  items: CallLogItem[];
}

export interface RemovalQueueItem {
  enrollmentId: string;
  consecutiveAbsentCount: number;
  lastAbsenceDate: string;
  // Oxirgi marta PRESENT/LATE bo'lgan dars sanasi (null = hech qachon
  // kelmagan).
  lastPresentDate: string | null;
  // Bugun bu o'quvchiga qo'ng'iroq qilinganmi.
  calledToday: boolean;
  student: OutreachStudentWithParent;
  group: OutreachGroupSummary;
  teacher: OutreachTeacher | null;
}

export interface RemovalQueueResponse {
  total: number;
  items: RemovalQueueItem[];
}

export interface ActivePromiseItem {
  promiseId: string;
  promiseDate: string;
  // Va'da sanasi o'tib ketganmi (qizil belgilanadi).
  isOverdue: boolean;
  comment: string | null;
  createdAt: string;
  student: OutreachStudentWithParent & { balance: number };
  groups: { id: string; name: string }[];
}

export interface ActivePromisesResponse {
  total: number;
  items: ActivePromiseItem[];
}

export interface OutreachStats {
  todayAbsentees: number;
  removalQueue: number;
  activePromises: number;
  callsToday: number;
}
