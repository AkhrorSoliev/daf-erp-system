import { z } from "zod";

export const editGroupSchema = z.object({
  name: z.string().optional().or(z.literal("")),
  level: z.string().min(1, "Darajani tanlang"),
  courseId: z.string().min(1, "Kursni tanlang"),
  roomId: z.string().optional().or(z.literal("")),
  exactDays: z.array(z.string()).min(1, "Kamida bir kun tanlang"),
  lessonStartTime: z.string().min(1, "Dars vaqtini tanlang"),
  lessonEndTime: z.string().optional().or(z.literal("")),
  status: z.number().min(1).max(4).optional(),
  startDate: z.date().optional().or(z.literal(undefined)),
  comment: z.string().optional().or(z.literal("")),
  teacherId: z.number().optional(),
});

export type EditGroupFormValues = z.infer<typeof editGroupSchema>;
