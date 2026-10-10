import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// No isActive and no status: a branch's state changes only through
// PATCH /branches/:id/status, which records history and runs the cascade.
export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, {
    message: "Telefon raqam 9 ta raqamdan iborat bo'lishi kerak",
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "Vaqt formati HH:mm bo'lishi kerak" })
  startOfWorkingDay?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: "Vaqt formati HH:mm bo'lishi kerak" })
  endOfWorkingDay?: string;

  // Printed on the student contract (ADR-0075).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  representativeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  representativePosition?: string;
}
