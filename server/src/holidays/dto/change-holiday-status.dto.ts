import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { HolidayStatus } from '@prisma/client';

export class ChangeHolidayStatusDto {
  @IsEnum(HolidayStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(HolidayStatus).join(', ')}`,
  })
  status: HolidayStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
