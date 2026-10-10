import { ArrayMinSize, IsArray, IsInt, IsOptional } from 'class-validator';
export class TaskParticipantsDto {
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) assigneeIds: number[];
  @IsOptional() @IsArray() @IsInt({ each: true }) watcherIds?: number[];
}
