import { Suspense } from "react";
import { TeacherSalaryClient } from "@/components/profile/teacher-salary-client";

/**
 * Lehrer-portal salary page. Mounts on `/profile/salary` and shows the
 * teacher the same monthly salary row the administration sees on
 * `/payments/salary`, plus the current cycle breakdown. Backend uses
 * `@CurrentUser('id')` so a teacher can only see their own data.
 *
 * Suspense: the month picker keeps its state in the URL (`useSearchParams`),
 * which bails out of static prerendering without a boundary.
 */
export default function ProfileSalaryPage() {
  return (
    <Suspense>
      <TeacherSalaryClient />
    </Suspense>
  );
}
