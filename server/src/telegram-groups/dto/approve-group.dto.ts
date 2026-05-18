import { IsInt, IsOptional, Min } from 'class-validator';

export class ApproveGroupDto {
  // Optional — MVP'da odatda null (kompaniya bo'yicha guruh).
  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;
}
