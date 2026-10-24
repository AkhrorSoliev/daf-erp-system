import { z } from "zod";
import { msg } from "@/i18n/msg";

// Validation texts are `msg()` markers: the form draws them with `t(…)` through
// `groupFormError`, so they follow the page language.
const COURSE_REQUIRED = msg("Kursni tanlang");
const LEVEL_REQUIRED = msg("Darajani tanlang");
const DAYS_REQUIRED = msg("Kamida bir kun tanlang");
const START_TIME_REQUIRED = msg("Dars vaqtini tanlang");

const GROUP_FORM_TEXTS = new Set<string>([COURSE_REQUIRED, LEVEL_REQUIRED, DAYS_REQUIRED, START_TIME_REQUIRED]);

/** Translates the schema's own messages; any other text (server, Zod default) is shown as it came. */
export function groupFormError(
  t: (source: string) => string,
  message: string | undefined,
): string | undefined {
  if (!message) return message;
  return GROUP_FORM_TEXTS.has(message) ? t(message) : message;
}

const baseGroupSchema = z.object({
  name: z.string().optional().or(z.literal("")),
  level: z.string().optional().or(z.literal("")),
  courseId: z.string().min(1, COURSE_REQUIRED),
  roomId: z.string().optional().or(z.literal("")),
  exactDays: z.array(z.string()).optional().default([]),
  lessonStartTime: z.string().optional().or(z.literal("")),
  lessonEndTime: z.string().optional().or(z.literal("")),
  lessonMinutes: z.number().min(15).max(300).optional().nullable(),
  status: z.number().min(1).max(4).optional(),
  startDate: z.date().optional().or(z.literal(undefined)),
  comment: z.string().optional().or(z.literal("")),
  teacherId: z.number().optional(),
});

export const addGroupSchema = baseGroupSchema.extend({
  level: z.string().min(1, LEVEL_REQUIRED),
  exactDays: z.array(z.string()).min(1, DAYS_REQUIRED),
  lessonStartTime: z.string().min(1, START_TIME_REQUIRED),
});

export const editGroupSchema = baseGroupSchema;

export type EditGroupFormValues = z.infer<typeof editGroupSchema>;
