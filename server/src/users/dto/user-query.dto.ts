import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform, Type } from 'class-transformer';
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

  /**
   * "Faqat faol xodimlar" — when true, restrict to ACTIVE users only
   * (isActive=true AND status=ACTIVE). Used by assignee dropdowns (e.g.
   * task assignment) so deactivated/terminated/suspended employees are not
   * offered. The general employees list omits this and shows everyone.
   */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  active_only?: boolean;
}
