import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { StudentStatus } from '@prisma/client';

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
   */
  @IsOptional()
  @IsObject()
  frozenRefundOverrides?: Record<string, number>;
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
