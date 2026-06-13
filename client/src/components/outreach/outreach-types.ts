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

// Shared badge labels + colors for call reason / outcome. Used by the
// outreach call-history tab, the log-call dialog, and the debtors page so the
// three surfaces never drift.
export const CALL_REASON_INFO: Record<
  CallReason,
  { label: string; className: string }
> = {
  ABSENCE: { label: "Kelmagan", className: "bg-amber-100 text-amber-800" },
  DEBT: { label: "Qarz", className: "bg-red-100 text-red-700" },
  REMOVAL: { label: "Chiqarish", className: "bg-orange-100 text-orange-800" },
  OTHER: { label: "Boshqa", className: "bg-slate-100 text-slate-700" },
};

export const CALL_OUTCOME_INFO: Record<
  CallOutcome,
  { label: string; className: string }
> = {
  ANSWERED: { label: "Gaplashildi", className: "bg-emerald-100 text-emerald-700" },
  NO_ANSWER: { label: "Javob bermadi", className: "bg-slate-100 text-slate-700" },
  WILL_COME: { label: "Keladi", className: "bg-indigo-100 text-indigo-700" },
  WILL_PAY: { label: "To'laydi", className: "bg-blue-100 text-blue-700" },
  PROMISED: { label: "Keladi / to'laydi", className: "bg-violet-100 text-violet-700" },
  LEFT: { label: "O'qishni tashladi", className: "bg-red-100 text-red-700" },
};

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
