import { LESSON_ALERT_TYPES } from '../../src/notifications/notification-kind';
import { pastLessonAlerts } from '../../src/notifications/past-lesson-alerts';
import { MIN_ALERT_DEBT } from '../../src/payment-promises/overdue-digest';
import { OLD_UNREAD_DAYS, cleanupSteps } from './notification-cleanup';

describe('cleanupSteps', () => {
  const now = new Date('2026-10-11T03:00:00.000Z');
  const cutoff = new Date(now.getTime() - OLD_UNREAD_DAYS * 86_400_000);
  const steps = cleanupSteps(now);
  // 08:00 in Tashkent on 11.10
  const today = '2026-10-11';
  const pastRule = pastLessonAlerts(today).sql;

  it('closes what was already done before it marks anything read', () => {
    expect(steps.map((s) => s.name)).toEqual([
      'Yopilgan topshiriqlar',
      "Hal bo'lgan va o'tib ketgan darslar",
      "Qarzi yopilgan va'dalar",
      '7 kundan eski kutilayotganlar',
      "7 kundan eski o'qilmaganlar",
    ]);
  });

  it('every closing step touches only open action rows', () => {
    for (const step of steps.slice(0, 4)) {
      for (const sql of [step.count.sql, step.apply.sql]) {
        expect(sql).toContain('"actionRequired"');
        expect(sql).toContain('"resolvedAt" IS NULL');
      }
    }
  });

  it('closes an overdue promise only once the debt is gone, at the run time', () => {
    expect(steps[2].apply.sql).toContain('"balance" >= 0');
    expect(steps[2].apply.values).toEqual([now, -MIN_ALERT_DEBT]);
    expect(steps[2].count.values).toEqual([-MIN_ALERT_DEBT]);
  });

  it('closes a 09:00 list once nobody on it owes, by the rule of the live resolver', () => {
    for (const sql of [steps[2].count.sql, steps[2].apply.sql]) {
      // the list: this company's rows of one branch key ('all' = no branch)
      expect(sql).toContain(`n."relatedEntityType" = 'BrokenPromises'`);
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('p."companyId" = n."companyId"');
      expect(sql).toContain(
        `COALESCE(p."branchId"::text, 'all') = n."relatedEntityId"`,
      );
      // its students: BROKEN promises flipped on the list's own Tashkent day
      expect(sql).toContain(`p."status" = 'BROKEN'`);
      expect(sql).toContain(
        `((p."reminderFiredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tashkent')::date`,
      );
      expect(sql).toContain(
        `((n."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tashkent')::date`,
      );
      // still owing: from MIN_ALERT_DEBT, a smaller debt was never listed
      expect(sql).toContain('s."balance" <= ?');
    }
    expect(MIN_ALERT_DEBT).toBe(1_000);
  });

  it('still closes the old per-student rows beside the lists', () => {
    expect(steps[2].apply.sql).toContain(`n."relatedEntityType" = 'Student'`);
  });

  it('resolves stale pending rows at the run time, sparing only open tasks', () => {
    const stale = steps[3];
    expect(stale.apply.sql).toContain('SET "resolvedAt"');
    expect(stale.apply.sql).toContain('starts_with(n."type"::text, \'TASK_\')');
    expect(stale.apply.sql).toContain("'NEW', 'IN_PROGRESS', 'IN_REVIEW'");
    expect(stale.apply.values).toEqual([
      now,
      cutoff,
      -MIN_ALERT_DEBT,
      ...LESSON_ALERT_TYPES,
      today,
    ]);
    expect(stale.count.values).toEqual([
      cutoff,
      -MIN_ALERT_DEBT,
      ...LESSON_ALERT_TYPES,
      today,
    ]);
  });

  it('step 2 also closes lesson alerts of past days that no question waits on, at the run time', () => {
    const lessons = steps[1];
    // the nightly sweep's own fragment, not a copy: both pick the same rows
    for (const sql of [lessons.count.sql, lessons.apply.sql]) {
      expect(sql).toContain(pastRule);
      expect(sql).toContain('IS NOT NULL) OR (');
    }
    expect(lessons.apply.sql).toContain('GREATEST(n."createdAt", COALESCE(');
    expect(lessons.apply.values).toEqual([now, ...LESSON_ALERT_TYPES, today]);
    expect(lessons.count.values).toEqual([...LESSON_ALERT_TYPES, today]);
  });

  it('draws the day line at Tashkent midnight, not UTC', () => {
    // 01:00 on 11.10 in Tashkent, still 10.10 in UTC
    const late = cleanupSteps(new Date('2026-10-10T20:00:00.000Z'));
    expect(late[1].count.values.at(-1)).toBe('2026-10-11');
  });

  it('step 4 leaves the rows of step 2 to it, so a dry run counts what apply writes', () => {
    expect(steps[3].count.sql).toContain(pastRule);
    expect(steps[3].apply.sql).toMatch(
      /AND NOT COALESCE\(\s+\(n\."actionRequired"/,
    );
  });

  it('leaves to step 3 the lists it closes with their own time, and takes the old ones', () => {
    const stale = steps[3].apply.sql;
    // a paid list is excluded (step 3 stamps it), nothing else is spared by
    // entity type, so a list older than the cutoff that still owes resolves here
    expect(stale).toMatch(
      /NOT COALESCE\(\s+EXISTS \(SELECT 1 FROM "Student" s WHERE/,
    );
    expect(stale.match(/BrokenPromises/g)).toHaveLength(1);
    expect(stale).toContain('n."createdAt" < ?');
  });

  it('marks read only unread rows older than seven days', () => {
    const read = steps[4];
    expect(read.apply.sql).toContain('SET "isRead" = true');
    expect(read.apply.sql).toContain('"isRead" = false');
    expect(read.apply.values).toEqual([cutoff]);
  });

  it('never deletes', () => {
    // `"deletedAt"` appears in the lesson step, so match the statement only.
    for (const step of steps) {
      expect(step.apply.sql).not.toMatch(/\bDELETE\s+FROM\b/i);
    }
  });
});
