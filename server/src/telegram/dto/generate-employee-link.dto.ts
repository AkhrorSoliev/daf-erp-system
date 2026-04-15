import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class GenerateEmployeeLinkDto {
  @IsInt()
  branchId: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  roleIds: number[];
}
