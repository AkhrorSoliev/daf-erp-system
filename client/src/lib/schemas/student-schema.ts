import { z } from "zod";

const phoneDigits = z
  .string()
  .regex(/^\d{9}$/, "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak")
  .or(z.literal(""));

export const editStudentSchema = z.object({
  firstName: z
    .string()
    .min(2, "Ism kamida 2 ta belgidan iborat bo'lishi kerak"),
  lastName: z
    .string()
    .min(2, "Familiya kamida 2 ta belgidan iborat bo'lishi kerak"),
  phone: z
    .string()
    .length(9, "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak")
    .regex(/^\d{9}$/, "Faqat raqamlar kiritilishi mumkin"),
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
  password: z
    .string()
    .min(4, "Parol kamida 4 ta belgidan iborat bo'lishi kerak")
    .optional()
    .or(z.literal("")),

  // Chegirma (faqat CEO/BD ko'radi)
  discountPercent: z
    .number()
    .int()
    .min(0, "Chegirma 0 dan kichik bo'lishi mumkin emas")
    .max(100, "Chegirma 100 dan katta bo'lishi mumkin emas")
    .optional(),
});

export type EditStudentFormValues = z.infer<typeof editStudentSchema>;

export const addStudentSchema = z.object({
  firstName: z
    .string()
    .min(2, "Ism kamida 2 ta belgidan iborat bo'lishi kerak"),
  lastName: z
    .string()
    .min(2, "Familiya kamida 2 ta belgidan iborat bo'lishi kerak"),
  phone: z
    .string()
    .length(9, "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak")
    .regex(/^\d{9}$/, "Faqat raqamlar kiritilishi mumkin"),
  groupId: z.string().optional(),
});

export type AddStudentFormValues = z.infer<typeof addStudentSchema>;
