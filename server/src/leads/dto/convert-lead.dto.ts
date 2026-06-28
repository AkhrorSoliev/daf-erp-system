import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class ConvertLeadDto {
  // Optional branch the new student is assigned to. Ignored when `groupId` is
  // set — the group's own branch always wins (a group lives in one branch).
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;

  // Optional group to enroll the new student into right after creation. When
  // set, the student is added to this group and assigned to the group's branch.
  // When omitted, conversion behaves as before (student created with no group).
  @IsOptional()
  @IsString()
  groupId?: string;

  // Optional first-lesson date (YYYY-MM-DD). Only meaningful together with
  // `groupId`. Omitted → enrollment defaults to today.
  @IsOptional()
  @IsDateString()
  startDate?: string;
}
