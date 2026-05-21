import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqami 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone?: string;

  // Empty string clears the source; an id sets it; absent leaves it unchanged.
  @IsOptional()
  @IsString()
  sourceId?: string;
}
