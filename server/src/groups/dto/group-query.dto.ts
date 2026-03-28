import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class GroupQueryDto extends PaginationDto {
  @IsInt()
  @Type(() => Number)
  branch_id: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  status?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
