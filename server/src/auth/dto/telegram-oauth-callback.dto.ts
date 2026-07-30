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

  /**
   * RFC 6749 §4.1.2.1 `error`ga qo'shimcha shu ikkalasini ham yuborishga
   * ruxsat beradi. Global `ValidationPipe` `forbidNonWhitelisted: true` bilan
   * ishlaydi — DTO'da e'lon qilinmagan har qanday query maydoni butun so'rovni
   * 400 bilan rad etadi, shuning uchun bular yo'q bo'lsa Telegram shu
   * maydonlar bilan qaytarganda foydalanuvchi hech qachon "Kirish bekor
   * qilindi" xabarini ko'rmaydi — validatsiya undan oldin bloklaydi.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  error_description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  error_uri?: string;
}
