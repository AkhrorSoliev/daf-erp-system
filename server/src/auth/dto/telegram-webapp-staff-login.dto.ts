import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Xodim Mini App kirishi (ADR-0045). O'quvchinikidan farqi — `studentId` yo'q:
 * xodimni tanlash ekrani bo'lmaydi, bir nechta hisob mos kelsa rad etiladi.
 */
export class TelegramWebAppStaffLoginDto {
  /** `Telegram.WebApp.initData` — xom query-string, o'zgartirilmagan holda. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  initData: string;
}
