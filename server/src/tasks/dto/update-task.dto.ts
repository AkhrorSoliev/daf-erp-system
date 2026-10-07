import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  /** ISO, a `YYYY-MM-DD` day, or `null` to clear. */
  @IsOptional() dueAt?: string | null;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'URGENT';
}
