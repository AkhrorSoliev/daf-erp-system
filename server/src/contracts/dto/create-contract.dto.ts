import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateContractDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @IsString()
  @IsNotEmpty()
  courseId: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsInt()
  @IsNotEmpty()
  branchId: number;

  @IsInt()
  @Min(0)
  totalAmount: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
