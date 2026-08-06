import { IsOptional, IsString, IsInt, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { COMMENTABLE_ENTITY_TYPES } from '../../common/auth/comment-entity-scope';
import type { CommentableEntityType } from '../../common/auth/comment-entity-scope';

export class CommentQueryDto {
  // See `CreateCommentDto` — the read side is the same list, because a thread
  // you cannot scope is one you cannot safely return either.
  @IsIn(COMMENTABLE_ENTITY_TYPES as unknown as string[])
  entityType: CommentableEntityType;

  @IsString()
  entityId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}

export class LatestCommentQueryDto {
  @IsIn(COMMENTABLE_ENTITY_TYPES as unknown as string[])
  entityType: CommentableEntityType;

  @IsString()
  entityId: string;
}
