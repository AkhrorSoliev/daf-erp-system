import { IsEnum } from 'class-validator';
import { AssigneeStatus } from '@prisma/client';

export class UpdateAssigneeStatusDto {
  @IsEnum(AssigneeStatus)
  status: AssigneeStatus;
}
