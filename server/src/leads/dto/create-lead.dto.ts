import {
  IsInt, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

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

  /**
   * Which branch this lead belongs to. OPTIONAL by design — a lead from the
   * public form or a cold call arrives before anyone knows. Null leaves it in
   * the unassigned pool every branch works from; conversion to a student is
   * where a branch becomes mandatory.
   */
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  branchId?: number;
}
