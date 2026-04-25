import {
  AlarmClock,
  Check,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export interface StudentAttendance {
  studentId: number;
  firstName: string;
  lastName: string;
  photo: string | null;
  status: AttendanceStatus | null;
  note: string | null;
}

export interface AttendanceEntry {
  studentId: number;
  status: AttendanceStatus | null;
  note?: string;
}

export const DAY_NAMES: Record<number, string> = {
  0: "Yakshanba",
  1: "Dushanba",
  2: "Seshanba",
  3: "Chorshanba",
  4: "Payshanba",
  5: "Juma",
  6: "Shanba",
};

export interface StatusOption {
  value: AttendanceStatus;
  label: string;
  icon: LucideIcon;
  color: string;
  activeColor: string;
  activeBg: string;
}

export const STATUS_CONFIG: StatusOption[] = [
  {
    value: "PRESENT",
    label: "Keldi",
    icon: Check,
    color:
      "border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-950/30",
    activeColor:
      "border-green-500 bg-green-500 text-white dark:border-green-500 dark:bg-green-600",
    activeBg: "",
  },
  {
    value: "ABSENT",
    label: "Kelmadi",
    icon: X,
    color:
      "border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30",
    activeColor:
      "border-red-500 bg-red-500 text-white dark:border-red-500 dark:bg-red-600",
    activeBg:
      "border-red-100 bg-red-50/60 dark:border-red-900/40 dark:bg-red-950/20",
  },
  {
    value: "LATE",
    label: "Kechikdi",
    icon: AlarmClock,
    color:
      "border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/30",
    activeColor:
      "border-amber-500 bg-amber-500 text-white dark:border-amber-500 dark:bg-amber-600",
    activeBg:
      "border-amber-100 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20",
  },
  {
    value: "EXCUSED",
    label: "Sababli",
    icon: ShieldCheck,
    color:
      "border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30",
    activeColor:
      "border-blue-500 bg-blue-500 text-white dark:border-blue-500 dark:bg-blue-600",
    activeBg:
      "border-blue-100 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20",
  },
];
