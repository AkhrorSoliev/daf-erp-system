import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class CallbacksQueryDto {
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

  // Comma-separated assignee statuses to include. Defaults to PENDING,SEEN
  // — DONE tasks are hidden from the active callback list.
  @IsOptional()
  @IsIn(['PENDING', 'SEEN', 'DONE', 'PENDING,SEEN', 'PENDING,DONE', 'SEEN,DONE', 'PENDING,SEEN,DONE'])
  status?: string;
}
