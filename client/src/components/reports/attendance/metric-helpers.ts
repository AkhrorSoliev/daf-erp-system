export type AttendanceBucket = "week" | "month";

export interface AttendanceStatusBreakdown {
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

export interface AttendanceTrendPoint {
  bucketStart: string;
  label: string;
  rate: number;
  total: number;
  retentionPct: number | null;
}

export interface AttendanceDayOfWeekPoint {
  day: string;
  rate: number;
}

export interface AttendanceGroupRanked {
  groupId: string;
  groupName: string;
  rate: number;
  retentionPct: number | null;
}

export interface AttendanceAnalyticsResponse {
  overallRate: number;
  overallRetention: number | null;
  statusBreakdown: AttendanceStatusBreakdown;
  bucket: AttendanceBucket;
  trend: AttendanceTrendPoint[];
  byDayOfWeek: AttendanceDayOfWeekPoint[];
  worstGroups: AttendanceGroupRanked[];
  bestGroups: AttendanceGroupRanked[];
}

export interface AttendanceTeacherRow {
  id: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  groupsCount: number;
  totalStudents: number;
  startStudentCount: number;
  endStudentCount: number;
  retentionPct: number | null;
  averageAttendance: number | null;
  averageFillRate: number | null;
}

export interface AttendanceTeachersResponse {
  teachers: AttendanceTeacherRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AttendanceGroupRow {
  groupId: string;
  groupName: string;
  branchId: number;
  branchName: string;
  courseId: string;
  courseName: string;
  teachers: Array<{ id: number; firstName: string; lastName: string }>;
  startStudentCount: number;
  endStudentCount: number;
  retentionPct: number | null;
  lessonCount: number;
  attendanceRate: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface AttendanceGroupsResponse {
  groups: AttendanceGroupRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AttendanceCourseRow {
  courseId: string;
  courseName: string;
  groupCount: number;
  startStudentCount: number;
  endStudentCount: number;
  retentionPct: number | null;
  lessonCount: number;
  attendanceRate: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
}

export interface AttendanceCoursesResponse {
  courses: AttendanceCourseRow[];
}

export type TeacherSortBy = "rate" | "groupsCount" | "retention";
export type GroupSortBy = "rate" | "studentCount" | "lessonCount" | "retention";
export type SortOrder = "asc" | "desc";

export const ATTENDANCE_BUCKET_LABELS: Record<AttendanceBucket, string> = {
  week: "Haftalik",
  month: "Oylik",
};

// Color thresholds — green ≥80%, amber ≥60%, red <60%
export function getAttendanceColor(pct: number | null): string | undefined {
  if (pct === null) return undefined;
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// Same thresholds as attendance — deliberate so users internalize one scale.
export function getRetentionColor(pct: number | null): string | undefined {
  if (pct === null) return undefined;
  if (pct >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

export function formatAttendancePct(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return "—";
  return `${Math.round(pct)}%`;
}

export function formatCount(count: number, suffix = "ta"): string {
  return `${count.toLocaleString("en-US")} ${suffix}`;
}

// Status palette — used in pie chart and table cells
export const STATUS_COLORS = {
  present: "#22c55e", // green-500
  late: "#f59e0b", // amber-500
  absent: "#ef4444", // red-500
  excused: "#06b6d4", // cyan-500
} as const;

export const STATUS_LABELS = {
  present: "Keldi",
  late: "Kechikdi",
  absent: "Kelmadi",
  excused: "Sababli",
} as const;

export const ATTENDANCE_KPI_TOOLTIPS = {
  overall:
    "Tanlangan davrdagi umumiy davomat foizi.\n\nHisob: (KELDI + KECHIKDI) / Jami yozuvlar × 100.\n\nRanglar:\n• Yashil — 80% va undan yuqori\n• Sariq — 60–79%\n• Qizil — 60% dan past",
  totalLessons:
    "Tanlangan davrda olingan davomat yozuvlari soni (har o'quvchi-dars uchun bitta yozuv).",
  present: "KELDI deb belgilangan davomat yozuvlari soni.",
  absent:
    "KELMADI (sababsiz) deb belgilangan davomat yozuvlari soni. Yuqori son — muammoli signal.",
  lateExcused:
    "KECHIKDI va SABABLI yozuvlarning yig'indisi.\n\nKechikdi — keldi, lekin kech.\nSababli — kelmadi, lekin sababi bor (kasal, dars bekor qilingan, va h.k.).",
  retention:
    "Saqlanish darajasi — davr boshida faol bo'lgan o'quvchilarning necha foizi davr oxirigacha guruhda qolgan.\n\nHisob: davr oxiridagi faol o'quvchilar / davr boshidagi faol o'quvchilar × 100.\n\nMuhim: davomat % yuqori bo'lib, saqlanish % past bo'lsa — bu 'omon qolganlar yaxshi keladi, lekin ko'pchilik ketib qoldi' degani.\n\nFaol = ACTIVE yoki FROZEN status. Ketgan = DROPPED / TRANSFERRED / COMPLETED.",
};

export const ATTENDANCE_TABLE_TOOLTIPS = {
  rate:
    "Davomat foizi: (KELDI + KECHIKDI) / Jami yozuvlar × 100.\n\nDarslar bekor qilingan yoki sababli kelmagan yozuvlar yig'indidan chiqariladi.",
  studentCount: "Hozirda guruhda o'qiyotgan faol o'quvchilar soni.",
  startStudentCount:
    "Tanlangan davr boshida guruhda faol bo'lgan o'quvchilar soni (ACTIVE yoki FROZEN status).",
  endStudentCount:
    "Tanlangan davr oxirida guruhda faol bo'lgan o'quvchilar soni (ACTIVE yoki FROZEN status).",
  retention:
    "Saqlanish %: davr oxirida qolgan o'quvchilar / davr boshida bo'lgan o'quvchilar × 100.\n\nDavomat % yuqori bo'lib, saqlanish past bo'lsa — qolgan o'quvchilar yaxshi keladi, lekin guruh kichraygan.\n\nRanglar:\n• Yashil ≥80% — yaxshi\n• Sariq 60–79% — diqqat\n• Qizil <60% — muammo",
  lessonCount:
    "Tanlangan davrda bu guruh uchun davomat olingan kunlar soni.",
  groupsCount: "Bu o'qituvchi yetakchilik qilayotgan faol guruhlar soni.",
  totalStudents:
    "O'qituvchining barcha guruhlaridagi faol o'quvchilarning umumiy soni.",
  statusBreakdown:
    "Davomat holatlari taqsimoti.\n\n• Keldi (yashil)\n• Kechikdi (sariq)\n• Kelmadi (qizil)\n• Sababli (siyohrang)",
};
