import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class UserQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  user_type?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branch_id?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  company_id?: number;
}
