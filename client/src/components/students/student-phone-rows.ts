import type { Student } from "@/data/student-model";

export interface StudentPhoneRow {
  key: "phone" | "extraPhone" | "parentPhone";
  label: string;
  phone: string;
  /** Opens the student portal (ADR-0067: the main and the backup number do). */
  signIn: boolean;
}

/** The card's numbers, named, empty ones left out. */
export function studentPhoneRows(
  s: Pick<Student, "phone" | "extraPhone" | "parentPhone">,
): StudentPhoneRow[] {
  const rows: StudentPhoneRow[] = [
    { key: "phone", label: "Asosiy", phone: s.phone, signIn: true },
  ];
  if (s.extraPhone) {
    rows.push({ key: "extraPhone", label: "Zaxira", phone: s.extraPhone, signIn: true });
  }
  if (s.parentPhone) {
    rows.push({ key: "parentPhone", label: "Ota-ona", phone: s.parentPhone, signIn: false });
  }
  return rows;
}
