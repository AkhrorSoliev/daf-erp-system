import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** The new owner; null or absent takes the owner away. */
export class AssignLeadOwnerDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2_147_483_647) // int4
  userId?: number | null;
}
