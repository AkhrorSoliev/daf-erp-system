type BadgeVariant = "default" | "secondary" | "destructive" | "outline" | "ghost";

interface StatusConfig {
  label: string;
  variant: BadgeVariant;
}

// ─── Student ──────────────────────────────────────────
export const STUDENT_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Muzlatilgan", variant: "secondary" },
  GRADUATED: { label: "Bitirgan", variant: "outline" },
  EXPELLED: { label: "Chetlatilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── User / Teacher ──────────────────────────────────
export const USER_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  SUSPENDED: { label: "To'xtatilgan", variant: "destructive" },
  TERMINATED: { label: "Ishdan bo'shatilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Group ────────────────────────────────────────────
export const GROUP_STATUS: Record<string, StatusConfig> = {
  FORMING: { label: "Boshlanmagan", variant: "secondary" },
  ACTIVE: { label: "Faol", variant: "default" },
  PAUSED: { label: "Pauza", variant: "outline" },
  COMPLETED: { label: "Tugallangan", variant: "secondary" },
  CANCELLED: { label: "To'xtatilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Course ───────────────────────────────────────────
export const COURSE_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  DEPRECATED: { label: "Eskirgan", variant: "outline" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Branch ───────────────────────────────────────────
export const BRANCH_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  CLOSED: { label: "Yopilgan", variant: "destructive" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Room ─────────────────────────────────────────────
export const ROOM_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  INACTIVE: { label: "Nofaol", variant: "secondary" },
  UNDER_MAINTENANCE: { label: "Ta'mirda", variant: "outline" },
  ARCHIVED: { label: "Arxivlangan", variant: "ghost" },
};

// ─── Enrollment ───────────────────────────────────────
export const ENROLLMENT_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  FROZEN: { label: "Muzlatilgan", variant: "secondary" },
  COMPLETED: { label: "Tugallangan", variant: "outline" },
  DROPPED: { label: "Chiqdi", variant: "destructive" },
  TRANSFERRED: { label: "O'tkazildi", variant: "secondary" },
};

// ─── Holiday ──────────────────────────────────────────
export const HOLIDAY_STATUS: Record<string, StatusConfig> = {
  ACTIVE: { label: "Faol", variant: "default" },
  CANCELLED: { label: "Bekor qilingan", variant: "destructive" },
};

// ─── Entity type → status config mapping ──────────────
export const ENTITY_STATUS_MAP: Record<string, Record<string, StatusConfig>> = {
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

// ─── Status transitions (frontend da validation uchun) ─
export const STATUS_TRANSITIONS: Record<string, Record<string, string[]>> = {
  students: {
    ACTIVE: ["INACTIVE", "GRADUATED", "EXPELLED"],
    INACTIVE: ["ACTIVE", "EXPELLED"],
    GRADUATED: ["ARCHIVED"],
    EXPELLED: ["ARCHIVED"],
    ARCHIVED: ["ACTIVE"],
  },
  teachers: {
    ACTIVE: ["INACTIVE", "SUSPENDED", "TERMINATED"],
    INACTIVE: ["ACTIVE", "TERMINATED"],
    SUSPENDED: ["ACTIVE", "TERMINATED"],
    TERMINATED: ["ARCHIVED"],
    ARCHIVED: ["ACTIVE"],
  },
  groups: {
    FORMING: ["ACTIVE", "CANCELLED"],
    ACTIVE: ["PAUSED", "COMPLETED", "CANCELLED"],
    PAUSED: ["ACTIVE", "CANCELLED"],
    COMPLETED: ["ARCHIVED"],
    CANCELLED: ["ARCHIVED"],
    ARCHIVED: ["FORMING"],
  },
  courses: {
    ACTIVE: ["INACTIVE", "DEPRECATED"],
    INACTIVE: ["ACTIVE", "DEPRECATED"],
    DEPRECATED: ["ARCHIVED"],
    ARCHIVED: ["ACTIVE"],
  },
  branches: {
    ACTIVE: ["INACTIVE", "CLOSED"],
    INACTIVE: ["ACTIVE", "CLOSED"],
    CLOSED: ["ARCHIVED"],
    ARCHIVED: ["ACTIVE"],
  },
  rooms: {
    ACTIVE: ["INACTIVE", "UNDER_MAINTENANCE", "ARCHIVED"],
    INACTIVE: ["ACTIVE", "UNDER_MAINTENANCE", "ARCHIVED"],
    UNDER_MAINTENANCE: ["ACTIVE", "ARCHIVED"],
    ARCHIVED: ["ACTIVE"],
  },
  holidays: {
    ACTIVE: ["CANCELLED"],
    CANCELLED: ["ACTIVE"],
  },
};

// Sabab majburiy bo'lgan statuslar
export const REASON_REQUIRED_STATUSES = [
  "EXPELLED", "TERMINATED", "CANCELLED", "CLOSED", "SUSPENDED",
];

export function getStatusConfig(entityType: string, status: string): StatusConfig {
  const map = ENTITY_STATUS_MAP[entityType];
  return map?.[status] ?? { label: status, variant: "outline" };
}

export function getAllowedTransitions(entityType: string, currentStatus: string): string[] {
  return STATUS_TRANSITIONS[entityType]?.[currentStatus] ?? [];
}
