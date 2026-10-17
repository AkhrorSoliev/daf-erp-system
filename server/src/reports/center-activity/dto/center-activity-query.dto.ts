import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Min } from 'class-validator';

/** `GET /reports/center-activity/overview` and `/excel`. The month's range is checked in `parseCenterMonth`. */
export class CenterActivityQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: "Oy YYYY-MM ko'rinishida bo'lishi kerak",
  })
  oy?: string;

  /** The branch the «Qachon xona bo'sh» table is drawn for. Must be inside the caller's scope (checked in the service). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "Filial butun son bo'lishi kerak" })
  @Min(1, { message: "Filial 1 dan kichik bo'lmaydi" })
  filial?: number;
}
