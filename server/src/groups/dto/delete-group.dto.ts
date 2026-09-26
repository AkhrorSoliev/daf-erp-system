import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Why a group is being deleted. Optional, like the reason on a group status
 * change. It becomes the group's status-history reason and follows
 * "Guruh o'chirildi: " on every enrolment the deletion closes.
 */
export class DeleteGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
