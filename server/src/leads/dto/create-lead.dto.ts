import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MaxLength(100)
  lastName: string;

  @Matches(/^\d{9}$/, {
    message: "Telefon raqami 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone: string;

  @IsString()
  sectionId: string;

  @IsOptional()
  @IsString()
  sourceId?: string;
}
