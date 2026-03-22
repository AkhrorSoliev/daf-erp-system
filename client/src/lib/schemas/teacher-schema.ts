import { z } from "zod";

export const editTeacherSchema = z.object({
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
  gender: z.enum(["male", "female", ""]).optional(),
  avatar: z.string().optional().or(z.literal("")),
  login: z.string().optional().or(z.literal("")),
  password: z.string().optional().or(z.literal("")),
});

export type EditTeacherFormValues = z.infer<typeof editTeacherSchema>;
