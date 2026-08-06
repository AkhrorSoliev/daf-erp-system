import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class ApproveGroupDto {
  /**
   * Which branch's operational events this group receives.
   *
   * Required UNLESS `receivesAllBranches` is set. It used to be optional with
   * no alternative, the client sent an empty body, and every group was born
   * branch-less — which, under the old broadcast filter, meant every group
   * received every branch's payments and attendance.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;

  /**
   * This group deliberately watches EVERY branch (an org-wide monitoring or
   * sales chat). CEO-only, because granting it hands a chat the other branch's
   * money and attendance traffic.
   */
  @IsOptional()
  @IsBoolean()
  receivesAllBranches?: boolean;
}
