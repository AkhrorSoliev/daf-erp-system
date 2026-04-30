import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateRefundDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @IsString()
  @IsNotEmpty()
  enrollmentId: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
