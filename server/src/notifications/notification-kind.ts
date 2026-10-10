import type { NotificationType } from '@prisma/client';
import { tashkentDateStr } from '../common/date/tashkent';

/**
 * The bell's four kinds (spec 2026-10-07 §8): «Topshiriqlar · Davomat ·
 * To'lovlar · Tizim». The API serves each row's group, so the client never
 * maps a type itself.
 */
export const NOTIFICATION_GROUPS = [
  'task',
  'attendance',
  'payment',
  'system',
] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

/** A `Record` over the enum: a new type does not compile until it is placed. */
export const NOTIFICATION_GROUP: Record<NotificationType, NotificationGroup> = {
  COMMENT: 'task',
  TASK_ASSIGNED: 'task',
  TASK_STATUS_CHANGED: 'task',
  TASK_DELETED: 'task',
  TASK_UPDATED: 'task',
  TASK_REMINDER: 'task',
  TASK_REVIEW: 'task',
  TASK_OVERDUE: 'task',
  LESSON_STARTED: 'attendance',
  ATTENDANCE_ADMIN_ALERT: 'attendance',
  ATTENDANCE_TEACHER_WARNING: 'attendance',
  ATTENDANCE_MISSING_TEACHER: 'attendance',
  ATTENDANCE_MISSING_ADMIN: 'attendance',
  ATTENDANCE_COMPLETED: 'attendance',
  LESSON_RESCHEDULED: 'attendance',
  LESSON_CANCELLED: 'attendance',
  ABSENCE_WARNING: 'attendance',
  ENROLLMENT_AUTO_PAUSED: 'attendance',
  PAYMENT_PROMISE_OVERDUE: 'payment',
  SYSTEM: 'system',
};

export const TYPES_BY_GROUP = Object.fromEntries(
  NOTIFICATION_GROUPS.map((group) => [
    group,
    (Object.keys(NOTIFICATION_GROUP) as NotificationType[]).filter(
      (type) => NOTIFICATION_GROUP[type] === group,
    ),
  ]),
) as Record<NotificationGroup, NotificationType[]>;

/** Spec §8: what waits for the recipient. Everything else is information. */
export const ACTION_TYPES: ReadonlySet<NotificationType> =
  new Set<NotificationType>([
    'ATTENDANCE_ADMIN_ALERT',
    'ATTENDANCE_MISSING_TEACHER',
    'ATTENDANCE_MISSING_ADMIN',
    'ATTENDANCE_TEACHER_WARNING',
    'LESSON_STARTED',
    'TASK_ASSIGNED',
    'TASK_REMINDER',
    'TASK_REVIEW',
    'PAYMENT_PROMISE_OVERDUE',
  ]);

/** Alerts about one group's lesson, sent on the lesson's own day. */
export const LESSON_ALERT_TYPES: readonly NotificationType[] = [
  'LESSON_STARTED',
  'ATTENDANCE_ADMIN_ALERT',
  'ATTENDANCE_TEACHER_WARNING',
  'ATTENDANCE_MISSING_TEACHER',
  'ATTENDANCE_MISSING_ADMIN',
];

/** The client folds one day's rows of one type into one line by this key. */
export function lessonGroupKey(type: NotificationType, day: string): string {
  return `${type}:${day}`;
}

/**
 * Decided once, when `NotificationsService.create` writes the row. `now` is
 * also the lesson's day: every lesson alert is sent on the lesson's own
 * Tashkent day (attendance-reminder.service.ts — the tick and the 23:00 sweep
 * look at today only), so the key carries the lesson date.
 */
export function notificationKind(
  type: NotificationType,
  now: Date,
  actionRequired?: boolean,
): { actionRequired: boolean; groupKey: string | null } {
  return {
    actionRequired: actionRequired ?? ACTION_TYPES.has(type),
    groupKey: LESSON_ALERT_TYPES.includes(type)
      ? lessonGroupKey(type, tashkentDateStr(now))
      : null,
  };
}
