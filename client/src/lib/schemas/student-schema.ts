import { z } from "zod";
import { msg } from "@/i18n/msg";

// Validation texts are `msg()` markers: the forms draw them with `t(…)`
// through `studentFormError`, so they follow the page language.
const PHONE_LENGTH = msg("Telefon raqam 9 ta raqamdan iborat bo'lishi kerak");
const FIRST_NAME_MIN = msg("Ism kamida 2 ta belgidan iborat bo'lishi kerak");
const LAST_NAME_MIN = msg(
  "Familiya kamida 2 ta belgidan iborat bo'lishi kerak",
);
const DIGITS_ONLY = msg("Faqat raqamlar kiritilishi mumkin");
const PASSWORD_MIN = msg("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
const DISCOUNT_MIN = msg("Chegirma 0 dan kichik bo'lishi mumkin emas");
const DISCOUNT_MAX = msg("Chegirma 100 dan katta bo'lishi mumkin emas");
const SOURCE_REQUIRED = msg("«Qayerdan bildi?» maydonini tanlang");

const STUDENT_FORM_TEXTS = new Set<string>([
  PHONE_LENGTH,
  FIRST_NAME_MIN,
  LAST_NAME_MIN,
  DIGITS_ONLY,
  PASSWORD_MIN,
  DISCOUNT_MIN,
  DISCOUNT_MAX,
  SOURCE_REQUIRED,
]);

/**
 * The text of a form error in the page language. Only this file's own
 * messages go through `t`: any other message (a default of the validation
 * library) is shown as it came, so `uz-Cyrl` never transliterates it.
 */
export function studentFormError(
  t: (source: string) => string,
  message: string | undefined,
): string | undefined {
  if (!message) return message;
  return STUDENT_FORM_TEXTS.has(message) ? t(message) : message;
}

const phoneDigits = z
  .string()
  .regex(/^\d{9}$/, PHONE_LENGTH)
  .or(z.literal(""));

export const editStudentSchema = z.object({
  firstName: z.string().min(2, FIRST_NAME_MIN),
  lastName: z.string().min(2, LAST_NAME_MIN),
  phone: z.string().length(9, PHONE_LENGTH).regex(/^\d{9}$/, DIGITS_ONLY),
  telegram: z.string().optional().or(z.literal("")),
  gender: z.enum(["male", "female", ""]).optional(),
  photo: z.string().optional().or(z.literal("")),
  dateOfBirth: z.string().optional().or(z.literal("")),
  comment: z.string().optional().or(z.literal("")),

  // Qo'shimcha aloqa ma'lumotlari
  extraPhone: phoneDigits.optional(),
  parentPhone: phoneDigits.optional(),
  parentName: z.string().optional().or(z.literal("")),
  placeOfStudy: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  passportSeries: z.string().optional().or(z.literal("")),

  // Autentifikatsiya — student.dafzentrum.uz uchun parolni admin yangilashi mumkin.
  // Login = telefon raqami (yuqorida); shu sababli alohida login maydoni yo'q.
  password: z.string().min(4, PASSWORD_MIN).optional().or(z.literal("")),

  // Chegirma (faqat CEO/BD ko'radi)
  discountPercent: z
    .number()
    .int()
    .min(0, DISCOUNT_MIN)
    .max(100, DISCOUNT_MAX)
    .optional(),
});

export type EditStudentFormValues = z.infer<typeof editStudentSchema>;

export const addStudentSchema = z.object({
  firstName: z.string().min(2, FIRST_NAME_MIN),
  lastName: z.string().min(2, LAST_NAME_MIN),
  phone: z.string().length(9, PHONE_LENGTH).regex(/^\d{9}$/, DIGITS_ONLY),
  extraPhone: phoneDigits.optional(),
  groupId: z.string().optional(),
  // Har bir o'quvchi lid sifatida tug'iladi: to'g'ridan qo'shilgan o'quvchining
  // manbasi boshqa hech qayerdan bilinmaydi, shuning uchun majburiy.
  sourceId: z.string().min(1, SOURCE_REQUIRED),
});

export type AddStudentFormValues = z.infer<typeof addStudentSchema>;
