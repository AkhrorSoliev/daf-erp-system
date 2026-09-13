import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

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

  /**
   * Empty string clears the extra phone; 9 digits set it; absent leaves it
   * unchanged. The regex accepts both so "tozalash" survives validation.
   */
  @IsOptional()
  @Matches(/^(\d{9})?$/, {
    message: "Qo'shimcha telefon raqami 9 ta raqamdan iborat bo'lishi kerak",
  })
  extraPhone?: string;

  // An id sets the source; absent leaves it unchanged. An empty string used to
  // clear it — no longer: a lead may not lose its source once it has one
  // (CEO decision 13.09.2026, the create path requires it too).
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: "Lid manbasini olib tashlab bo'lmaydi" })
  sourceId?: string;
}
