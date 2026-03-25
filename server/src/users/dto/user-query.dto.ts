import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class UserQueryDto {
  @IsOptional()
  @IsString()
  user_type?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branch_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  company_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  per_page?: number = 10;
}
