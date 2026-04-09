import { StatusBadge } from "@/components/ui/status-badge";
import type { Student } from "@/data/student-model";

/**
 * Student uchun status badge.
 * Backend dan kelgan `status` field ishlatadi (ACTIVE, INACTIVE, GRADUATED, EXPELLED, ARCHIVED).
 * Eski `getStudentStatus` logikasi orqali ham ishlaydi (backward compat).
 */
export function StudentStatusBadge({ student }: { student: Student }) {
  // Yangi enum status mavjud bo'lsa — uni ishlatamiz
  if (student.status) {
    return <StatusBadge entityType="students" status={student.status} />;
  }

  // Fallback: eski logika
  const legacyStatus = student.isActive
    ? student.groups?.length > 0 ? "ACTIVE" : "ACTIVE"
    : "INACTIVE";

  return <StatusBadge entityType="students" status={legacyStatus} />;
}
