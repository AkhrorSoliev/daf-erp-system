import { z } from "zod";
import { msg } from "@/i18n/msg";

export const CEO_ROLE_ID = 1;
export const TEACHER_ROLE_ID = 4;

// Validation texts are `msg()` markers: the form draws them with `t(…)` through
// `employeeFormError`, so they follow the page language.
const FIRST_NAME_MIN = msg("Ism kamida 2 ta belgidan iborat bo'lishi kerak");
const LAST_NAME_MIN = msg("Familiya kamida 2 ta belgidan iborat bo'lishi kerak");
const PHONE_LENGTH = msg("Telefon raqam 9 ta raqamdan iborat bo'lishi kerak");
const POSITION_MIN = msg("Lavozim kamida 2 ta belgidan iborat bo'lishi kerak");
const POSITION_MAX = msg("Lavozim 60 ta belgidan oshmasligi kerak");
const BRANCH_ROLELESS = msg("Tizimga kirmaydigan xodim uchun ham filial tanlanishi shart");
const BRANCH_TEACHER = msg("O'qituvchi uchun kamida bitta filial tanlang");
const BRANCH_REQUIRED = msg("Kamida bitta filial tanlang");
const PASSWORD_NEW = msg("Yangi xodim uchun parol majburiy (kamida 4 ta belgi)");
const PASSWORD_MIN = msg("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
const ONLY_DIGITS = msg("Faqat raqam");
const MAIN_BRANCH_REQUIRED = msg("Bir nechta filial tanlanganda asosiy filial tanlanishi shart");

const EMPLOYEE_FORM_TEXTS = new Set<string>([
  FIRST_NAME_MIN,
  LAST_NAME_MIN,
  PHONE_LENGTH,
  POSITION_MIN,
  POSITION_MAX,
  BRANCH_ROLELESS,
  BRANCH_TEACHER,
  BRANCH_REQUIRED,
  PASSWORD_NEW,
  PASSWORD_MIN,
  MAIN_BRANCH_REQUIRED,
  ONLY_DIGITS,
]);

/** Translates the schema's own messages; any other text (server, Zod default) is shown as it came. */
export function employeeFormError(
  t: (source: string) => string,
  message: string | undefined,
): string | undefined {
  if (!message) return message;
  return EMPLOYEE_FORM_TEXTS.has(message) ? t(message) : message;
}

export const employeeSchema = z
  .object({
    firstName: z.string().min(2, FIRST_NAME_MIN),
    lastName: z.string().min(2, LAST_NAME_MIN),
    phone: z
      .string()
      .regex(/^\d{9}$/, PHONE_LENGTH)
      .or(z.literal("")),
    login: z.string().optional().or(z.literal("")),
    password: z.string().optional().or(z.literal("")),
    gender: z.enum(["MALE", "FEMALE", ""]).optional(),
    status: z.string().optional(),
    mainBranch: z.string().optional(),
    position: z.string().trim().min(2, POSITION_MIN).max(60, POSITION_MAX),
    roleIds: z.array(z.number()),
    branchIds: z.array(z.number()),
    // The official (bank) part of the pay, so'm. Shown only to a salary.view holder.
    officialSalary: z.string().regex(/^\d*$/, ONLY_DIGITS).optional(),
    isEdit: z.boolean(),
  })
  .superRefine((data, ctx) => {
    const hasCeoRole = data.roleIds.includes(CEO_ROLE_ID);
    const hasTeacherRole = data.roleIds.includes(TEACHER_ROLE_ID);
    const hasRoles = data.roleIds.length > 0;

    if (!hasCeoRole && data.branchIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["branchIds"],
        message: !hasRoles
          ? BRANCH_ROLELESS
          : hasTeacherRole
            ? BRANCH_TEACHER
            : BRANCH_REQUIRED,
      });
    }

    if (!data.isEdit && hasRoles) {
      if (!data.password || data.password.length < 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["password"],
          message: PASSWORD_NEW,
        });
      }
    } else if (data.password && data.password.length < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: PASSWORD_MIN,
      });
    }

    if (data.branchIds.length > 1 && !data.mainBranch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["mainBranch"],
        message: MAIN_BRANCH_REQUIRED,
      });
    }
  });

/** The number to send, or undefined (leave it as it is) while the field is empty. */
export function officialSalaryOf(text: string | undefined): number | undefined {
  return text ? Number(text) : undefined;
}

export type EmployeeFormValues = z.infer<typeof employeeSchema>;
