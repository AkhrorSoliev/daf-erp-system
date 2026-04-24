import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDepartureReasonDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}
