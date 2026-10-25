import { IsObject } from 'class-validator';

export class UpdateTaxSettingsDto {
  /** Kalit → o'sha kalitning BUTUN yangi ro'yxati. Qiymat `parseDated*` da tekshiriladi. */
  @IsObject({ message: "values obyekt bo'lishi kerak" })
  values!: Record<string, unknown>;
}
