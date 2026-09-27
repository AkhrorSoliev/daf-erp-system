import {
  PauseCircle,
  Snowflake,
  GraduationCap,
  Ban,
  CircleCheck,
  CircleOff,
  ShieldOff,
  UserX,
  Play,
  Square,
  XCircle,
  Wrench,
  Archive,
  type LucideIcon,
} from "lucide-react";

// ─── Status card configs ─────────────────────────────
export interface StatusCardConfig {
  icon: LucideIcon;
  label: string;
  description: string;
  color: string; // tailwind color name
}

export const STATUS_CARD_CONFIG: Record<string, StatusCardConfig> = {
  // Student
  ACTIVE: { icon: CircleCheck, label: "Faol", description: "Qayta o'qishni davom ettiradi", color: "emerald" },
  INACTIVE: { icon: PauseCircle, label: "Nofaol", description: "Aloqaga chiqmayapti", color: "amber" },
  FROZEN: { icon: Snowflake, label: "Muzlatilgan", description: "Vaqtincha to'xtadi, keyin qaytadi", color: "blue" },
  GRADUATED: { icon: GraduationCap, label: "Bitirgan", description: "Kursni muvaffaqiyatli tugatdi", color: "emerald" },
  EXPELLED: { icon: Ban, label: "Chetlatilgan", description: "O'qishni butunlay tashlab ketdi", color: "red" },
  ARCHIVED: { icon: Archive, label: "Arxivlash", description: "Faqat xato/duplikat yozuv uchun", color: "red" },
  // User/Teacher
  SUSPENDED: { icon: ShieldOff, label: "To'xtatilgan", description: "Vaqtincha to'xtatish", color: "amber" },
  TERMINATED: { icon: UserX, label: "Ishdan bo'shatilgan", description: "Butunlay to'xtatish", color: "red" },
  // Group
  FORMING: { icon: Play, label: "Boshlanmagan", description: "Guruh shakllanmoqda", color: "blue" },
  PAUSED: { icon: PauseCircle, label: "Pauza", description: "Vaqtincha to'xtatish", color: "amber" },
  COMPLETED: { icon: CircleCheck, label: "Tugallangan", description: "Guruh tugadi", color: "emerald" },
  CANCELLED: { icon: XCircle, label: "Bekor qilingan", description: "Guruh bekor qilindi", color: "red" },
  // Course/Branch/Room
  DEPRECATED: { icon: Archive, label: "Eskirgan", description: "Endi ishlatilmaydi", color: "gray" },
  CLOSED: { icon: Square, label: "Yopilgan", description: "Filial yopildi", color: "red" },
  UNDER_MAINTENANCE: { icon: Wrench, label: "Ta'mirda", description: "Xona ta'mirda", color: "amber" },
};

export const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; iconBg: string }> = {
  emerald: {
    bg: "bg-emerald-50 dark:bg-emerald-950/20",
    border: "border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-400",
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    iconBg: "bg-red-100 dark:bg-red-900/40",
  },
  gray: {
    bg: "bg-muted/50",
    border: "border-border",
    text: "text-muted-foreground",
    iconBg: "bg-muted",
  },
};

export function getCardConfig(status: string): StatusCardConfig {
  return STATUS_CARD_CONFIG[status] ?? {
    icon: CircleOff,
    label: status,
    description: "",
    color: "gray",
  };
}
