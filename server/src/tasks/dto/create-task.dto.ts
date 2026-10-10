import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { COMMENTABLE_ENTITY_TYPES } from '../../common/auth/comment-entity-scope';

export class CreateTaskStepDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;
}

export class CreateTaskDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) assigneeIds: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) watcherIds?: number[];
  /** ISO instant; or a `YYYY-MM-DD` day → 18:00 Tashkent. */
  @IsOptional() @IsString() dueAt?: string;
  @IsOptional() @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT']) priority?:
    | 'LOW'
    | 'MEDIUM'
    | 'HIGH'
    | 'URGENT';
  /** A link is both halves or neither: either one present makes both required. */
  @ValidateIf(
    (o: CreateTaskDto) =>
      o.entityType !== undefined || o.entityId !== undefined,
  )
  @IsIn(COMMENTABLE_ENTITY_TYPES as unknown as string[])
  entityType?: string;
  @ValidateIf(
    (o: CreateTaskDto) =>
      o.entityType !== undefined || o.entityId !== undefined,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  entityId?: string;
  @IsOptional() @IsBoolean() separateCopies?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaskStepDto)
  steps?: CreateTaskStepDto[];
}
