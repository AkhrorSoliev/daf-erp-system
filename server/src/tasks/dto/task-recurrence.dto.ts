import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/** The shape only; `normalizeSchedule` gives the 400s with Uzbek messages. */
export class TaskRecurrenceDto {
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY']) freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  weekdays?: number[];
  @IsOptional() @IsInt() dayOfMonth?: number;
  /** "HH:mm" Tashkent; 18:00 when absent. */
  @IsOptional() @IsString() dueTime?: string;
}

export class UpdateTaskRecurrenceDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => TaskRecurrenceDto)
  schedule?: TaskRecurrenceDto;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  assigneeIds?: number[];
}
