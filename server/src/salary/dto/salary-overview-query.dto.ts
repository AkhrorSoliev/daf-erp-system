import { IsOptional, IsString, IsIn } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Query for the "Ustozlar oyligi" live overview (teachers with their current
 * salary state). Paginated + searchable + optional configured/unconfigured
 * filter.
 */
export class SalaryOverviewQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['all', 'configured', 'unconfigured'])
  status?: 'all' | 'configured' | 'unconfigured';
}
