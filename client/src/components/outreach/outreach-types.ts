import { msg } from "@/i18n/msg";

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

export type CallOutcome =
  | "ANSWERED"
  | "NO_ANSWER"
  | "PROMISED" // legacy combined "keladi / to'laydi"
  | "WILL_COME"
  | "WILL_PAY"
  | "LEFT";

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
  // Ko'rilayotgan sanadagi oxirgi qo'ng'iroq natijasi (null = qo'ng'iroq yo'q).
  callOutcome: CallOutcome | null;
  student: OutreachStudent;
  group: OutreachGroupSummary & {
    lessonStartTime: string | null;
    lessonEndTime: string | null;
  };
  teacher: OutreachTeacher | null;
}

// Qo'ng'iroq sababi (qaysi ro'yxatdan chiqilgan).
export type CallReason = "ABSENCE" | "DEBT" | "REMOVAL" | "OTHER";

// Shared badge labels + colors for call reason / outcome. Used by the
// outreach call-history tab, the log-call dialog, and the debtors page so the
// three surfaces never drift.
export const CALL_REASON_INFO: Record<
  CallReason,
  { label: string; className: string }
> = {
  ABSENCE: { label: msg("Kelmagan"), className: "bg-amber-100 text-amber-800" },
  DEBT: { label: msg("Qarz"), className: "bg-red-100 text-red-700" },
  REMOVAL: { label: msg("Ko'p dars qoldirgan"), className: "bg-orange-100 text-orange-800" },
  OTHER: { label: msg("Boshqa"), className: "bg-slate-100 text-slate-700" },
};

export const CALL_OUTCOME_INFO: Record<
  CallOutcome,
  { label: string; className: string }
> = {
  ANSWERED: {
    label: msg("Gaplashildi"),
    className: "bg-emerald-100 text-emerald-700",
  },
  NO_ANSWER: {
    label: msg("Javob bermadi"),
    className: "bg-slate-100 text-slate-700",
  },
  WILL_COME: { label: msg("Keladi"), className: "bg-indigo-100 text-indigo-700" },
  WILL_PAY: { label: msg("To'laydi"), className: "bg-blue-100 text-blue-700" },
  PROMISED: {
    label: msg("Keladi / to'laydi"),
    className: "bg-violet-100 text-violet-700",
  },
  LEFT: { label: msg("O'qishni tashladi"), className: "bg-red-100 text-red-700" },
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
  // Shu qoldirish uchun ogohlantirish yuborilgan sana (null = yuborilmagan).
  // Admin takror qo'ng'iroq qilmasligi uchun qatorda belgilanadi.
  warnedAt: string | null;
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
  // Sozlamadagi pauza chegarasi — «pauzagacha N dars» shundan hisoblanadi.
  pauseThreshold: number;
  items: RemovalQueueItem[];
}

export interface AutoPausedItem {
  studentId: number;
  // Qachon pauzaga o'tkazilgan (ISO). null = eski yozuv.
  pausedAt: string | null;
  // "Avtomatik pauza: 3 ta ketma-ket dars qoldirildi (oxirgisi 12.09.2026)"
  reason: string | null;
  calledToday: boolean;
  student: OutreachStudentWithParent & { balance: number };
  group: OutreachGroupSummary | null;
}

export interface AutoPausedResponse {
  total: number;
  items: AutoPausedItem[];
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

export interface BlockedFromLessonsItem {
  enrollmentId: string;
  // Ustoz davomat olgan, lekin o'ziga belgi qo'yilmagan darslar soni.
  missedLessons: number;
  // Oxirgi belgisiz qolgan dars kuni ('YYYY-MM-DD').
  lastMissedDate: string;
  // Oxirgi marta PRESENT/LATE bo'lgan kun (null = hech qachon kelmagan).
  lastCameDate: string | null;
  // Musbat son: o'quvchining qarzi (so'm).
  debt: number;
  calledToday: boolean;
  // Eng oxirgi qo'ng'iroq (sabab qanday bo'lmasin).
  lastCall: { at: string; outcome: CallOutcome } | null;
  // Ochiq yoki buzilgan to'lov va'dasi.
  promise: { date: string; status: "OPEN" | "BROKEN" } | null;
  student: OutreachStudentWithParent & { balance: number };
  group: OutreachGroupSummary;
  teacher: OutreachTeacher | null;
}

export interface BlockedFromLessonsResponse {
  total: number;
  items: BlockedFromLessonsItem[];
}

export interface OutreachStats {
  todayAbsentees: number;
  removalQueue: number;
  blockedFromLessons: number;
  activePromises: number;
  callsToday: number;
}
