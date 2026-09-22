import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
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

  /**
   * Optional second contact number, entered from the "Qo'shimcha ma'lumotlar"
   * panel. Same 9-digit raw format as `phone`.
   */
  @IsOptional()
  @Matches(/^\d{9}$/, {
    message: "Qo'shimcha telefon raqami 9 ta raqamdan iborat bo'lishi kerak",
  })
  extraPhone?: string;

  @IsString()
  sectionId: string;

  /**
   * «Qayerdan bildi?» — MAJBURIY (CEO qarori, 13.09.2026). Manbasiz lid
   * voronka va manba hisobotida «noma'lum» bo'lib qoladi. Bu DTO faqat admin
   * doskaga qo'shadigan lid uchun; ochiq forma lidni `LeadsService.create` ni
   * to'g'ridan chaqirib yaratadi va manbasi havola tegidan keladi.
   */
  @IsString()
  @IsNotEmpty({ message: 'Lid manbasini tanlang' })
  sourceId!: string;

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
