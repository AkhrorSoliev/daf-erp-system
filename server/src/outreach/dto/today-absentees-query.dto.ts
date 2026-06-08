import { IsOptional, IsString, Matches } from 'class-validator';

export class TodayAbsenteesQueryDto {
  // Optional YYYY-MM-DD calendar date (Tashkent). Defaults to today when omitted
  // so the call signature stays compatible with the original endpoint.
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "date YYYY-MM-DD formatida bo'lishi kerak",
  })
  date?: string;
}
