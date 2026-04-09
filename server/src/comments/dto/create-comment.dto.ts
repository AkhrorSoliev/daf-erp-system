import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsInt,
  IsIn,
  IsDateString,
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

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}
