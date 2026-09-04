import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { toStringArray } from '../../common/dto/to-array';

/** Payment-status filter values for the participants list. */
export const PARTICIPANT_PAID_STATUSES = ['paid', 'pending', 'cash'] as const;
export type ParticipantPaidStatus = (typeof PARTICIPANT_PAID_STATUSES)[number];

export class ParticipantsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  /** Filter by the chosen exam time slots ("HH:mm"), comma-separated. */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  examTime?: string[];

  /** Filter by CEFR levels (A1..C2), comma-separated. */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  @MaxLength(4, { each: true })
  level?: string[];

  /**
   * Filter by payment status: `paid` (settled), `pending` (unpaid, no cash
   * intent), or `cash` (unpaid, chose to pay cash on arrival).
   */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(PARTICIPANT_PAID_STATUSES, { each: true })
  paidStatus?: ParticipantPaidStatus[];

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
