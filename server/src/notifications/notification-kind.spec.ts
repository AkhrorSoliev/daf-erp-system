import { readFileSync } from 'fs';
import { join } from 'path';
import { NotificationType } from '@prisma/client';
import {
  ACTION_TYPES,
  LESSON_ALERT_TYPES,
  NOTIFICATION_GROUP,
  TYPES_BY_GROUP,
  lessonGroupKey,
  notificationKind,
} from './notification-kind';

describe('notificationKind', () => {
  it('marks exactly the spec §8 types as waiting for action', () => {
    expect([...ACTION_TYPES].sort()).toEqual([
      'ATTENDANCE_ADMIN_ALERT',
      'ATTENDANCE_MISSING_ADMIN',
      'ATTENDANCE_MISSING_TEACHER',
      'ATTENDANCE_TEACHER_WARNING',
      'LESSON_STARTED',
      'PAYMENT_PROMISE_OVERDUE',
      'TASK_ASSIGNED',
      'TASK_REMINDER',
      'TASK_REVIEW',
    ]);
  });

  it("lets the caller override the type's default (the task plan)", () => {
    const now = new Date();
    expect(
      notificationKind(NotificationType.TASK_ASSIGNED, now, false)
        .actionRequired,
    ).toBe(false);
    expect(
      notificationKind(NotificationType.TASK_STATUS_CHANGED, now, true)
        .actionRequired,
    ).toBe(true);
    expect(
      notificationKind(NotificationType.TASK_STATUS_CHANGED, now)
        .actionRequired,
    ).toBe(false);
  });

  it('keys a lesson alert by its type and the Tashkent day it was sent', () => {
    // 20:30 UTC on the 10th is 01:30 on the 11th in Tashkent.
    expect(
      notificationKind(
        NotificationType.ATTENDANCE_ADMIN_ALERT,
        new Date('2026-10-10T20:30:00.000Z'),
      ).groupKey,
    ).toBe('ATTENDANCE_ADMIN_ALERT:2026-10-11');
    expect(lessonGroupKey(NotificationType.LESSON_STARTED, '2026-10-10')).toBe(
      'LESSON_STARTED:2026-10-10',
    );
  });

  it('leaves every other type ungrouped', () => {
    for (const type of Object.values(NotificationType)) {
      if (LESSON_ALERT_TYPES.includes(type)) continue;
      expect(notificationKind(type, new Date()).groupKey).toBeNull();
    }
  });

  it('puts every type in exactly one of the four groups', () => {
    expect(Object.values(TYPES_BY_GROUP).flat().sort()).toEqual(
      Object.values(NotificationType).sort(),
    );
    expect(NOTIFICATION_GROUP.TASK_REVIEW).toBe('task');
    expect(NOTIFICATION_GROUP.ATTENDANCE_MISSING_ADMIN).toBe('attendance');
    expect(NOTIFICATION_GROUP.PAYMENT_PROMISE_OVERDUE).toBe('payment');
    expect(NOTIFICATION_GROUP.SYSTEM).toBe('system');
  });
});

describe('notification_action_state migration', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../prisma/migrations/20261010120000_notification_action_state/migration.sql',
    ),
    'utf8',
  );

  /** The quoted enum names in the `"type" IN (...)` of the UPDATE that `update` matches. */
  function typesOf(update: RegExp): string[] {
    const match = update.exec(sql);
    if (!match) throw new Error(`migration has no UPDATE matching ${update}`);
    return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]).sort();
  }

  // The backfill SQL is hand-written; these keep it from drifting away from
  // the code that stamps new rows.
  it('backfills actionRequired for exactly ACTION_TYPES', () => {
    expect(
      typesOf(/SET "actionRequired" = true\s+WHERE "type" IN \(([^)]*)\)/),
    ).toEqual([...ACTION_TYPES].sort());
  });

  it('backfills groupKey for exactly LESSON_ALERT_TYPES', () => {
    expect(
      typesOf(/SET "groupKey"[\s\S]*?WHERE "type" IN \(([^)]*)\)/),
    ).toEqual([...LESSON_ALERT_TYPES].sort());
  });
});
