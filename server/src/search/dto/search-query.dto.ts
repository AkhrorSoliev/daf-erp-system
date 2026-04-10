import { IsString, IsOptional, IsIn, MinLength, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class SearchQueryDto extends PaginationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search: string;

  @IsOptional()
  @IsIn(['students', 'users', 'teachers', 'groups', 'courses'])
  type?: string;
}
