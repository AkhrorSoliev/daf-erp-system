import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The migration is the only thing standing between the first 19:50 run and a
// bill sent to every student for a month already under way: charges written
// before it must be stamped. This spec keeps that UPDATE from being dropped.
const SQL = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260927200000_monthly_payment_notices/migration.sql',
  ),
  'utf-8',
);

describe('monthly payment notices migration', () => {
  it('adds both digest categories', () => {
    expect(SQL).toContain(
      `ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'MONTHLY_CHARGE';`,
    );
    expect(SQL).toContain(
      `ALTER TYPE "TelegramDigestCategory" ADD VALUE IF NOT EXISTS 'PAYMENT_REMINDER';`,
    );
  });

  it('adds the nullable marker column', () => {
    expect(SQL).toContain(
      'ALTER TABLE "EnrollmentMonthlyCharge" ADD COLUMN "noticeQueuedAt" TIMESTAMP(3);',
    );
  });

  it('stamps every existing charge, so no student is billed for a month already under way', () => {
    expect(SQL).toMatch(
      /UPDATE "EnrollmentMonthlyCharge"\s+SET "noticeQueuedAt" = CURRENT_TIMESTAMP\s+WHERE "noticeQueuedAt" IS NULL;/,
    );
  });
});
