type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost";

interface StatusConfig {
  label: string;
  variant: BadgeVariant;
}

// ─── Student ──────────────────────────────────────────
const STUDENT_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  FROZEN: { label: "Muzlatilgan", variant: "outline" },
  GRADUATED: { label: "Bitirgan", variant: "outline" },
  EXPELLED: { label: "Chetlatilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── User / Teacher ──────────────────────────────────
const USER_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  SUSPENDED: { label: "To'xtatilgan", variant: "destructive" },
  TERMINATED: { label: "Ishdan bo'shatilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Group ────────────────────────────────────────────
const GROUP_STATUS: Record<string, StatusConfig> = {
  FORMING: { label: "Boshlanmagan", variant: "secondary" },
  ACTIVE: { label: "Faol", variant: "default" },
  PAUSED: { label: "Pauza", variant: "outline" },
  COMPLETED: { label: "Tugallangan", variant: "secondary" },
  CANCELLED: { label: "To'xtatilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Course ───────────────────────────────────────────
const COURSE_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  DEPRECATED: { label: "Eskirgan", variant: "outline" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Branch ───────────────────────────────────────────
const BRANCH_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  CLOSED: { label: "Yopilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Room ─────────────────────────────────────────────
const ROOM_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  UNDER_MAINTENANCE: { label: "Ta'mirda", variant: "outline" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Enrollment ───────────────────────────────────────
const ENROLLMENT_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  FROZEN: { label: "Muzlatilgan", variant: "secondary" },
  COMPLETED: { label: "Tugallangan", variant: "outline" },
  DROPPED: { label: "Chiqdi", variant: "destructive" },
  TRANSFERRED: { label: "O'tkazildi", variant: "secondary" },
};

// ─── Holiday ──────────────────────────────────────────
const HOLIDAY_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  CANCELLED: { label: "Bekor qilingan", variant: "destructive" },
};

// ─── Entity type → status config mapping ──────────────
const ENTITY_STATUS_MAP: Record<string, Record<string, StatusConfig>> = {
  students: STUDENT_STATUS,
  teachers: USER_STATUS,
  users: USER_STATUS,
  groups: GROUP_STATUS,
  courses: COURSE_STATUS,
  branches: BRANCH_STATUS,
  rooms: ROOM_STATUS,
  enrollments: ENROLLMENT_STATUS,
  holidays: HOLIDAY_STATUS,
};

// ─── Entity type → API endpoint mapping ───────────────
export const ENTITY_API_PATH: Record<string, string> = {
  students: "/students",
  teachers: "/teachers",
  users: "/users",
  groups: "/groups",
  courses: "/courses",
  branches: "/branches",
  rooms: "/rooms",
  holidays: "/holidays",
};

// ─── Status transitions (backend bilan sinxron) ──────
// ARCHIVED hech qachon qo'yilmaydi — arxivlash faqat "O'chirish" orqali
const STATUS_TRANSITIONS: Record<string, Record<string, string[]>> = {
  students: {
    ACTIVE: ["INACTIVE", "FROZEN", "GRADUATED", "EXPELLED"],
    INACTIVE: ["ACTIVE", "FROZEN", "EXPELLED"],
    FROZEN: ["ACTIVE", "INACTIVE"],
    GRADUATED: ["ACTIVE"],
    EXPELLED: ["ACTIVE"],
  },
  teachers: {
    ACTIVE: ["INACTIVE", "SUSPENDED", "TERMINATED"],
    INACTIVE: ["ACTIVE", "TERMINATED"],
    SUSPENDED: ["ACTIVE", "TERMINATED"],
    // TERMINATED — terminal, hech narsaga o'tmaydi
  },
  groups: {
    FORMING: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
    PAUSED: ["ACTIVE", "CANCELLED"],
    // COMPLETED — terminal
    // CANCELLED — terminal
  },
  courses: {
    ACTIVE: ["INACTIVE", "DEPRECATED"],
    INACTIVE: ["ACTIVE", "DEPRECATED"],
    // DEPRECATED — terminal (arxiv orqali o'chiriladi)
  },
  branches: {
    ACTIVE: ["INACTIVE", "CLOSED"],
    INACTIVE: ["ACTIVE", "CLOSED"],
    // CLOSED — terminal
  },
  rooms: {
    ACTIVE: ["INACTIVE", "UNDER_MAINTENANCE"],
    INACTIVE: ["ACTIVE", "UNDER_MAINTENANCE"],
    UNDER_MAINTENANCE: ["ACTIVE"],
  },
  holidays: {
    ACTIVE: ["CANCELLED"],
    CANCELLED: ["ACTIVE"],
  },
};

export function getStatusConfig(entityType: string, status: string): StatusConfig {
  const map = ENTITY_STATUS_MAP[entityType];
  return map?.[status] ?? { label: status, variant: "outline" };
}

export function getAllowedTransitions(entityType: string, currentStatus: string): string[] {
  return STATUS_TRANSITIONS[entityType]?.[currentStatus] ?? [];
}
