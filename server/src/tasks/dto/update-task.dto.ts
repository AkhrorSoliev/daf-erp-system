import { Transform } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class UpdateTaskDto {
  // `null` is refused for title and priority (non-null columns); only `undefined` skips.
  @ValidateIf((_, v) => v !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  /** ISO, a `YYYY-MM-DD` day, or `null` to clear. */
  @IsOptional() @IsString() dueAt?: string | null;
  @ValidateIf((_, v) => v !== undefined)
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}
