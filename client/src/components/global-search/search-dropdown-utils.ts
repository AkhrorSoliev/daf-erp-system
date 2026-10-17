import {
  BookOpen,
  FileText,
  GraduationCap,
  Layers,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@/i18n/msg";

export interface FlatItem {
  type: string;
  id: string | number;
  url?: string;
  action?: () => void;
}

export const entityRoutes: Record<string, (id: string | number) => string> = {
  students: (id) => `/students/profile/${id}`,
  teachers: (id) => `/teachers/profile/${id}`,
  users: (id) => `/settings/employees/${id}`,
  groups: (id) => `/groups/${id}`,
  courses: () => `/settings/courses`,
};

export const categoryConfig: { key: string; label: string; icon: LucideIcon }[] =
  [
    { key: "pages", label: msg("Sahifalar"), icon: FileText },
    { key: "students", label: msg("O'quvchilar"), icon: BookOpen },
    { key: "users", label: msg("Xodimlar"), icon: Users },
    { key: "teachers", label: msg("O'qituvchilar"), icon: GraduationCap },
    { key: "groups", label: msg("Guruhlar"), icon: UsersRound },
    { key: "courses", label: msg("Kurslar"), icon: Layers },
  ];

export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

export function getInitials(label: string): string {
  const parts = label.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}
