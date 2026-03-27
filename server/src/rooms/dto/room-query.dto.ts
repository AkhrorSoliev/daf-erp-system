import { IsInt, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class RoomQueryDto extends PaginationDto {
  @IsInt()
  @Type(() => Number)
  branch_id: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  company_id?: number;
}
