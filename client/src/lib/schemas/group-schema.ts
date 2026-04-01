import { z } from "zod";

const baseGroupSchema = z.object({
  name: z.string().optional().or(z.literal("")),
  level: z.string().optional().or(z.literal("")),
  courseId: z.string().min(1, "Kursni tanlang"),
  roomId: z.string().optional().or(z.literal("")),
  exactDays: z.array(z.string()).optional().default([]),
  lessonStartTime: z.string().optional().or(z.literal("")),
  lessonEndTime: z.string().optional().or(z.literal("")),
  status: z.number().min(1).max(4).optional(),
  startDate: z.date().optional().or(z.literal(undefined)),
  comment: z.string().optional().or(z.literal("")),
  teacherId: z.number().optional(),
});

export const addGroupSchema = baseGroupSchema.extend({
  level: z.string().min(1, "Darajani tanlang"),
  exactDays: z.array(z.string()).min(1, "Kamida bir kun tanlang"),
  lessonStartTime: z.string().min(1, "Dars vaqtini tanlang"),
});

export const editGroupSchema = baseGroupSchema;

export type EditGroupFormValues = z.infer<typeof editGroupSchema>;
