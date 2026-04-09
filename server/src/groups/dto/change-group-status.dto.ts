import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { GroupStatus } from '@prisma/client';

export class ChangeGroupStatusDto {
  @IsEnum(GroupStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(GroupStatus).join(', ')}`,
  })
  status: GroupStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
