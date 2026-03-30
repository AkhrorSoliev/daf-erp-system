import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatus } from '@prisma/client';

export class ChangeTeacherStatusDto {
  @IsEnum(UserStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(UserStatus).join(', ')}`,
  })
  status: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
