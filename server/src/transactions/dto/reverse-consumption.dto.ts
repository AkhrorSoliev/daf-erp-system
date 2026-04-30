import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ReverseConsumptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
