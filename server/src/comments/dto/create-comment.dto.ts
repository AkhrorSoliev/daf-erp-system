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
import { COMMENTABLE_ENTITY_TYPES } from '../../common/auth/comment-entity-scope';
import type { CommentableEntityType } from '../../common/auth/comment-entity-scope';

export class CreateCommentDto {
  // A closed list, not a free string. `Comment.entityType` is a bare `String`
  // in the schema and this DTO accepted anything, so whatever the client sent
  // became a valid thread — on an entity nobody checked existed, belonged to
  // this company, or belonged to this caller's branch. An unknown type now
  // fails here rather than creating a thread that cannot be scoped.
  @IsIn(COMMENTABLE_ENTITY_TYPES as unknown as string[])
  entityType: CommentableEntityType;

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
