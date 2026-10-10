import { MIN_ALERT_DEBT } from '../../src/payment-promises/overdue-digest';
import { OLD_UNREAD_DAYS, cleanupSteps } from './notification-cleanup';

describe('cleanupSteps', () => {
  const now = new Date('2026-10-11T03:00:00.000Z');
  const cutoff = new Date(now.getTime() - OLD_UNREAD_DAYS * 86_400_000);
  const steps = cleanupSteps(now);

  it('closes what was already done before it marks anything read', () => {
    expect(steps.map((s) => s.name)).toEqual([
      'Yopilgan topshiriqlar',
      "Hal bo'lgan darslar",
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
    expect(stale.apply.values).toEqual([now, cutoff, -MIN_ALERT_DEBT]);
    expect(stale.count.values).toEqual([cutoff, -MIN_ALERT_DEBT]);
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
