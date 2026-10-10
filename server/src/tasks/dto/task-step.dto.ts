import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
export class CreateStepDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;
}
export class UpdateStepDto {
  // `null` is refused (non-null columns); only `undefined` skips.
  @ValidateIf((_, v) => v !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @ValidateIf((_, v) => v !== undefined)
  @IsBoolean()
  done?: boolean;
}
