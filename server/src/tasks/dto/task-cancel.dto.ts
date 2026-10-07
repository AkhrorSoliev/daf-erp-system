import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';
export class TaskCancelDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
