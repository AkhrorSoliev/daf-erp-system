import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { toNumberArray, toStringArray } from '../../common/dto/to-array';

export class ListTasksDto {
  @IsIn(['my', 'created', 'all']) view: 'my' | 'created' | 'all';
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(['NEW', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED'], {
    each: true,
  })
  status?: string[];
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  assigneeId?: number[];
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  authorId?: number[];
  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  branchId?: number[];
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], { each: true })
  priority?: string[];
  @IsOptional() @IsIn(['overdue', 'today', 'week']) due?:
    | 'overdue'
    | 'today'
    | 'week';
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  /** DONE column: only tasks closed in the last N days (default 14). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  closedDays?: number;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
