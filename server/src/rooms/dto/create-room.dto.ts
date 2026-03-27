import { IsString, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity?: number;

  @IsInt()
  @Type(() => Number)
  branchId: number;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  companyId?: number;
}
