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

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Vaqt formati HH:mm bo\'lishi kerak' })
  startOfWorkingDay?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Vaqt formati HH:mm bo\'lishi kerak' })
  endOfWorkingDay?: string;

  @IsNotEmpty()
  @IsInt()
  companyId: number;
}
