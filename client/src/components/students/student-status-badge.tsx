"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/context";
import { getStatusConfig } from "@/lib/status-config";
import type { Student } from "@/data/student-model";

/**
 * Student uchun status badge.
 * Backend dan kelgan `status` field ishlatadi (ACTIVE, INACTIVE, GRADUATED, EXPELLED, ARCHIVED).
 * Eski `getStudentStatus` logikasi orqali ham ishlaydi (backward compat).
 *
 * It draws the badge itself (not the shared `StatusBadge`) because the student
 * labels are `msg()` texts that are translated here; the other entities' labels
 * in `status-config.ts` are not translated yet.
 */
export function StudentStatusBadge({ student }: { student: Student }) {
  const t = useT();
  // Yangi enum status mavjud bo'lsa — uni ishlatamiz; aks holda eski logika
  const status = student.status || (student.isActive ? "ACTIVE" : "INACTIVE");
  const config = getStatusConfig("students", status);

  return <Badge variant={config.variant}>{t(config.label)}</Badge>;
}
