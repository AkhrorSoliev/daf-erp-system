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
    expect(steps[2].apply.values).toEqual([now]);
  });

  it('resolves stale pending rows at the run time, sparing only open tasks', () => {
    const stale = steps[3];
    expect(stale.apply.sql).toContain('SET "resolvedAt"');
    expect(stale.apply.sql).toContain('starts_with(n."type"::text, \'TASK_\')');
    expect(stale.apply.sql).toContain("'NEW', 'IN_PROGRESS', 'IN_REVIEW'");
    expect(stale.apply.values).toEqual([now, cutoff]);
    expect(stale.count.values).toEqual([cutoff]);
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
