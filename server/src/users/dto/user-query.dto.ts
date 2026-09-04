import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { toStringArray } from '../../common/dto/to-array';

/**
 * Rol filtridagi maxsus token: umuman roli yo'q xodimlar.
 *
 * Rolsiz xodim ataylab mavjud — farrosh yoki qorovul oyliq oladi, lekin
 * tizimga kira olmaydi (ADR-0007). Rol nomlari ro'yxatida ular hech qaysi
 * variantga tushmaydi, ya'ni filtr ularni ko'rsata olmaydi; shu token o'sha
 * teshikni yopadi. Ikki tagchiziq — bu rol nomi emas, belgi.
 */
export const ROLELESS_TOKEN = '__roleless';

export class UserQueryDto extends PaginationDto {
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  user_type?: string[];

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
