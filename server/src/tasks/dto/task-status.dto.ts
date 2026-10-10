import { IsIn } from 'class-validator';
export class TaskStatusDto {
  @IsIn(['NEW', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']) status:
    | 'NEW'
    | 'IN_PROGRESS'
    | 'IN_REVIEW'
    | 'DONE';
}
