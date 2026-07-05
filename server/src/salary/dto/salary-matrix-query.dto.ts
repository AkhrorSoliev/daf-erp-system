import { IsString, Matches } from 'class-validator';

/**
 * Query for the "oylar kesimida" (teacher × month) matrix. `from`/`to` are
 * inclusive month bounds in `YYYY-MM`, interpreted in Tashkent time.
 */
export class SalaryMatrixQueryDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: "from 'YYYY-MM' bo'lishi kerak" })
  from: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: "to 'YYYY-MM' bo'lishi kerak" })
  to: string;
}
