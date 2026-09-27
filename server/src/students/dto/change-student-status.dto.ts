import {
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StudentStatus } from '@prisma/client';
import { DEPARTURE_POLICIES } from '../../billing/departure-policy';
import type { DeparturePolicy } from '../../billing/departure-policy';

export class ChangeStudentStatusDto {
  @IsEnum(StudentStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(StudentStatus).join(', ')}`,
  })
  status: StudentStatus;

  @IsOptional()
  @IsUUID()
  reasonId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /**
   * FROZEN-only: per-enrollment override of the lessons-to-refund count.
   * Map key = enrollmentId (UUID), value = how many lessons to refund.
   *
   * - Omit / leave blank: refund auto-suggests `prepaidLessonsRemaining`
   *   for each active enrollment.
   * - Value > current prepaid: extra LESSON_CONSUMPTION rows are reversed,
   *   matching salary accruals are reversed (closed-period guard applies),
   *   and the affected attendances flip to EXCUSED.
   * - Value < current prepaid: only that many lessons are refunded;
   *   remaining prepaid is forfeited.
   *
   * No per-key validation here — runtime enforces "<= prepaid + consumed"
   * because we need to query the DB to know the actual consumption count.
   * LESSON_PACK enrollments only — a key for a MONTHLY enrollment is rejected (400).
   */
  @IsOptional()
  @IsObject()
  frozenRefundOverrides?: Record<string, number>;

  /**
   * EXPELLED only: who ended the student's enrollments, which decides what
   * the month's charge gives back (contract 6.2, ADR-0043). Omitted = the
   * student's own decision. Any other value is a CEO's or branch director's
   * call; with any other status it is refused (400).
   */
  @IsOptional()
  @IsIn(DEPARTURE_POLICIES)
  departurePolicy?: DeparturePolicy;
}

/**
 * Per-enrollment integer validator helper (used at the service layer
 * since class-validator can't validate arbitrary record values).
 */
export function validateFrozenRefundOverrides(
  overrides: Record<string, number> | undefined,
): void {
  if (!overrides) return;
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(
        `frozenRefundOverrides[${key}] must be a non-negative integer, got: ${value}`,
      );
    }
  }
}
