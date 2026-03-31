import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  MinLength,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  entityType: string;

  @IsString()
  entityId: string;

  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsBoolean()
  isTask?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  assigneeIds?: number[];
}
