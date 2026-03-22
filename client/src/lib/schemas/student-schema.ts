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
  avatar: z.string().optional().or(z.literal("")),

  // Qo'shimcha aloqa ma'lumotlari
  extraPhone: phoneDigits.optional(),
  parentPhone: phoneDigits.optional(),
  parentName: z.string().optional().or(z.literal("")),
  placeOfStudy: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  passportSeries: z.string().optional().or(z.literal("")),

  // Autentifikatsiya
  login: z.string().optional().or(z.literal("")),
  password: z.string().optional().or(z.literal("")),
});

export type EditStudentFormValues = z.infer<typeof editStudentSchema>;
