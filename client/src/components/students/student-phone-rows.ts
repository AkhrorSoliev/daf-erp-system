import type { Student } from "@/data/student-model";

export interface StudentPhoneRow {
  key: "phone" | "extraPhone" | "parentPhone";
  label: string;
  phone: string;
  /** Opens the student portal (ADR-0070: the main and the backup number do). */
  signIn: boolean;
  /** `tel:` link from the last nine digits (parentPhone is not validated on the server). */
  telHref: string;
}

function row(
  key: StudentPhoneRow["key"],
  label: string,
  phone: string,
  signIn: boolean,
): StudentPhoneRow {
  return {
    key,
    label,
    phone,
    signIn,
    telHref: `tel:+998${phone.replace(/\D/g, "").slice(-9)}`,
  };
}

/** The card's numbers, named, empty ones left out. */
export function studentPhoneRows(
  s: Pick<Student, "phone" | "extraPhone" | "parentPhone">,
): StudentPhoneRow[] {
  const rows = [row("phone", "Asosiy", s.phone, true)];
  if (s.extraPhone) rows.push(row("extraPhone", "Zaxira", s.extraPhone, true));
  if (s.parentPhone) rows.push(row("parentPhone", "Ota-ona", s.parentPhone, false));
  return rows;
}
