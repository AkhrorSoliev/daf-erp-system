import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CallOutcome, CallReason } from '@prisma/client';

export class CreateCallLogDto {
  @Type(() => Number)
  @IsInt()
  studentId: number;

  // Which outreach list the call came from — drives the "Sabab" badge in history.
  @IsEnum(CallReason)
  reason: CallReason;

  // Quick-pick result of the call (Gaplashildi / Javob bermadi / Keladi /
  // To'laydi / O'qishni tashladi).
  @IsEnum(CallOutcome)
  outcome: CallOutcome;

  // Free-text note about the call — optional.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  // Optional payment date — only honored when outcome is WILL_PAY. Creates or
  // updates the student's OPEN payment promise so it shows on "To'lov sanalari".
  @IsOptional()
  @IsDateString()
  promiseDate?: string;
}
