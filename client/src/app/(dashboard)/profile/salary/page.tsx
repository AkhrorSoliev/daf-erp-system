import { TeacherSalaryClient } from "@/components/profile/teacher-salary-client";

/**
 * Lehrer-portal salary page. Mounts on `/profile/salary` and shows the
 * teacher their own expected vs actual earnings + the current cycle
 * breakdown. Backend uses `@CurrentUser('id')` so a teacher can only
 * see their own data.
 */
export default function ProfileSalaryPage() {
  return <TeacherSalaryClient />;
}
