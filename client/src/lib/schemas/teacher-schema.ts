import { z } from "zod";
import { msg } from "@/i18n/msg";

// Validation texts are `msg()` markers: the form draws them with `t(…)` through
// `teacherFormError`, so they follow the page language.
const FIRST_NAME_MIN = msg("Ism kamida 2 ta belgidan iborat bo'lishi kerak");
const LAST_NAME_MIN = msg("Familiya kamida 2 ta belgidan iborat bo'lishi kerak");
const PHONE_LENGTH = msg("Telefon raqam 9 ta raqamdan iborat bo'lishi kerak");
const DIGITS_ONLY = msg("Faqat raqamlar kiritilishi mumkin");
const LOGIN_MIN = msg("Login kamida 3 ta belgi");
const PASSWORD_MIN = msg("Parol kamida 6 ta belgi");

const TEACHER_FORM_TEXTS = new Set<string>([
  FIRST_NAME_MIN,
  LAST_NAME_MIN,
  PHONE_LENGTH,
  DIGITS_ONLY,
  LOGIN_MIN,
  PASSWORD_MIN,
]);

/** Translates the schema's own messages; any other text (server, Zod default) is shown as it came. */
export function teacherFormError(
  t: (source: string) => string,
  message: string | undefined,
): string | undefined {
  if (!message) return message;
  return TEACHER_FORM_TEXTS.has(message) ? t(message) : message;
}

export const editTeacherSchema = z.object({
  firstName: z.string().min(2, FIRST_NAME_MIN),
  lastName: z.string().min(2, LAST_NAME_MIN),
  phone: z.string().length(9, PHONE_LENGTH).regex(/^\d{9}$/, DIGITS_ONLY),
  gender: z.enum(["male", "female", ""]).optional(),
  avatar: z.string().optional().or(z.literal("")),
  login: z.string().min(3, LOGIN_MIN).optional().or(z.literal("")),
  password: z.string().min(6, PASSWORD_MIN).optional().or(z.literal("")),
});

export type EditTeacherFormValues = z.infer<typeof editTeacherSchema>;
