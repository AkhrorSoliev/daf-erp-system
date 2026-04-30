import { IsOptional, IsInt, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class StudentQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branch_id?: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  teacher_id?: number;

  @IsOptional()
  @IsString()
  group_id?: string;

  @IsOptional()
  @IsString()
  level?: string;
}
