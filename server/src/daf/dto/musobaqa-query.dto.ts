import { IsOptional, Matches } from 'class-validator';

export class MusobaqaQueryDto {
  /** Dushanba `YYYY-MM-DD`; yo'q = joriy hafta. Chegarani servis tekshiradi. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "hafta YYYY-MM-DD ko'rinishida bo'lishi kerak",
  })
  hafta?: string;
}
