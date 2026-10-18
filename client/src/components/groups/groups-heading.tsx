"use client";

import { useAuth } from "@/hooks/use-auth";
import { isTeacherOnly } from "@/lib/teacher-only";
import { useT } from "@/i18n/context";

/** The groups page title: a teacher is not «managing all groups», these are theirs. */
export function GroupsHeading() {
  const t = useT();
  const roles = useAuth((s) => s.user?.roles);
  const mine = isTeacherOnly(roles);
  return (
    <div>
      <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight">
        {mine ? t("Guruhlarim") : t("Guruhlar")}
      </h1>
      <p className="text-muted-foreground">
        {mine ? t("Sizga biriktirilgan guruhlar") : t("Barcha guruhlarni boshqarish")}
      </p>
    </div>
  );
}
