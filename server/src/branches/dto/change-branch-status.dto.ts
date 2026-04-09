import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BranchStatus } from '@prisma/client';

export class ChangeBranchStatusDto {
  @IsEnum(BranchStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(BranchStatus).join(', ')}`,
  })
  status: BranchStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
