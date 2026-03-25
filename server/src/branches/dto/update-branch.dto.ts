import { IsOptional, IsString, IsBoolean, Matches } from 'class-validator';

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'Telefon raqam 9 ta raqamdan iborat bo\'lishi kerak' })
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
