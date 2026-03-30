import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeStatusDto {
  @IsNotEmpty()
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
