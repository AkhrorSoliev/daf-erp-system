import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Payment-status filter values for the participants list. */
export const PARTICIPANT_PAID_STATUSES = ['paid', 'pending', 'cash'] as const;
export type ParticipantPaidStatus = (typeof PARTICIPANT_PAID_STATUSES)[number];

export class ParticipantsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Filter by the chosen exam time slot ("HH:mm"). */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  examTime?: string;

  /** Filter by CEFR level (A1..C2). */
  @IsOptional()
  @IsString()
  @MaxLength(4)
  level?: string;

  /**
   * Filter by payment status: `paid` (settled), `pending` (unpaid, no cash
   * intent), or `cash` (unpaid, chose to pay cash on arrival).
   */
  @IsOptional()
  @IsIn(PARTICIPANT_PAID_STATUSES)
  paidStatus?: ParticipantPaidStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
