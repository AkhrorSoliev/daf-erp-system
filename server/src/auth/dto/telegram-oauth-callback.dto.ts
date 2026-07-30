import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Telegram redirect'i bilan keladigan query. */
export class TelegramOauthCallbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  state?: string;

  /** Foydalanuvchi rad etsa Telegram `error` bilan qaytaradi. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  error?: string;
}
