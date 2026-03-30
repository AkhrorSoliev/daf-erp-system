import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { StudentStatus } from '@prisma/client';

export class ChangeStudentStatusDto {
  @IsEnum(StudentStatus, {
    message: `Status quyidagilardan biri bo'lishi kerak: ${Object.values(StudentStatus).join(', ')}`,
  })
  status: StudentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
