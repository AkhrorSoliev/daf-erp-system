import { IsInt, IsOptional, Min } from 'class-validator';

/** The new owner; null or absent takes the owner away. */
export class AssignLeadOwnerDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  userId?: number | null;
}
