import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'Telefon raqam 9 ta raqamdan iborat bo\'lishi kerak' })
  phone?: string;

  @IsOptional()
  @IsString()
  photo?: string;
}
