import { IsOptional, IsString } from 'class-validator';

export class ApproveJoinRequestDto {
  /** Another group of the same branch (spec D7); the requested one when omitted. */
  @IsOptional()
  @IsString()
  groupId?: string;
}
