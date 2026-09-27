import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class TelegramWebAppLoginDto {
  /** `Telegram.WebApp.initData` — xom query-string, o'zgartirilmagan holda. */
  @IsString()
  @IsNotEmpty()
  // Haqiqiy `initData` 1 KB atrofida; chegara faqat katta tanani imzo
  // hisoblashdan oldin qaytarish uchun.
  @MaxLength(4096)
  initData: string;

  /** Telegram'ga bir nechta o'quvchi bog'langan bo'lsa — tanlangani. */
  @IsOptional()
  @IsInt()
  @Min(1)
  studentId?: number;
}
