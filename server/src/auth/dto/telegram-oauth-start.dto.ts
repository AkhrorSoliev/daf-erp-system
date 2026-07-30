import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Global ValidationPipe `forbidNonWhitelisted: true` bilan ishlaydi, ya'ni
 * DTO'da e'lon qilinmagan query parametri so'rovni rad etadi.
 */
export class TelegramOauthStartDto {
  /** Portal manzili. Bo'sh bo'lsa `Origin` sarlavhasidan olinadi. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  origin?: string;
}
