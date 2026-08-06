import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Change which branches an already-approved group watches.
 *
 * Both fields are optional and independent: a group can be moved from one
 * branch to another, promoted to watching every branch, or demoted back. What
 * it may NOT become is silent by accident — the service refuses an update that
 * would leave it with neither a branch nor the all-branches flag, because that
 * is the ambiguous state this field was added to remove.
 */
export class UpdateTelegramGroupDto {
  /** `null` clears the branch — only legal alongside `receivesAllBranches`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number | null;

  @IsOptional()
  @IsBoolean()
  receivesAllBranches?: boolean;
}
