import { IsInt, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateBranchDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'Telefon raqam 9 ta raqamdan iborat bo\'lishi kerak' })
  phone?: string;

  @IsNotEmpty()
  @IsInt()
  companyId: number;
}
