import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CourseQueryDto extends PaginationDto {
  @IsInt()
  @Type(() => Number)
  branch_id: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  company_id?: number;
}
