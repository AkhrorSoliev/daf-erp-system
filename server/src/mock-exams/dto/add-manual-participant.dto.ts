import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { CEFR_LEVELS } from '../mock-exam-pricing.util';

export class AddManualParticipantDto {
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @Matches(/^\d{9}$/, {
    message: "Telefon raqami 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone: string;

  /**
   * Optional Telegram chat ID — when supplied, the admin claims this
   * participant occupies the same identity slot a Telegram-based
   * registration would (uniqueness is enforced by the DB index).
   * When omitted, a synthetic identifier `manual_<timestamp>_<random>` is
   * used so the unique constraint still holds.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  telegramChatId?: string;

  /**
   * Explicit DaF student link, set when the admin picks the student in the
   * dialog's search (the phone the participant gave may not be the one on
   * the card). The participant is tied to that Student.id (its publicId), the
   * DaF mock discount applies and the result shows on the student's profile.
   * When omitted the service still auto-detects a student by phone. The fee
   * is never taken from the balance.
   */
  @IsOptional()
  @IsInt()
  @Min(10000)
  studentId?: number;

  /** CEFR level (A1..C2) — optional, when the exam offers levels. */
  @IsOptional()
  @IsIn(CEFR_LEVELS)
  level?: string;

  /** Exam time slot ("HH:mm") — optional, when the exam offers times. */
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  examTime?: string;
}
