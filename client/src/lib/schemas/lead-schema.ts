import { z } from "zod";

export const addStudentFromLeadSchema = z.object({
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
  gender: z.enum(["male", "female"]),
  group: z.string().min(1, "Guruh tanlanishi shart"),
  telegram: z.string().optional().or(z.literal("")),
  parentPhone: z
    .string()
    .regex(/^\d{9}$/, "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak")
    .optional()
    .or(z.literal("")),
  parentName: z.string().optional().or(z.literal("")),
});

export type AddStudentFromLeadValues = z.infer<typeof addStudentFromLeadSchema>;
