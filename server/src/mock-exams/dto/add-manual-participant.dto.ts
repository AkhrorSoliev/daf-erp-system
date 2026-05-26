import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
}
