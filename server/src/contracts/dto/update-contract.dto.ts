import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;

  @IsOptional()
  @IsString()
  signedDocUrl?: string;
}
