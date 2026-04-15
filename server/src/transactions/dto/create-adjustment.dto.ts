import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAdjustmentDto {
  @IsInt()
  @IsNotEmpty()
  studentId: number;

  @IsInt()
  @IsNotEmpty()
  amount: number;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsOptional()
  @IsInt()
  branchId?: number;
}
