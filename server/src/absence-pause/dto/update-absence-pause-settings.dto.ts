import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAbsencePauseSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Nechta ketma-ket qoldirishda ogohlantirish yuborilsin. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  warnThreshold?: number;

  /** Nechta ketma-ket qoldirishda pauza qilinsin. */
  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(20)
  pauseThreshold?: number;

  /**
   * Bir yurishda ruxsat etilgan eng ko'p pauza. Oshsa — HECH KIM pauza
   * qilinmaydi (fail-closed) va CEO ga xabar ketadi.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  dailyCap?: number;
}
