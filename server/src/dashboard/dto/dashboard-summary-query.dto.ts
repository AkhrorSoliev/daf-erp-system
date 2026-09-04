import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class DashboardSummaryQueryDto {
  /**
   * Tanlangan filial. `@BranchScope()` uni chaqiruvchining ruxsat shifti bilan
   * kesib beradi, shuning uchun servis bu qiymatga to'g'ridan-to'g'ri
   * tayanmaydi — DTO uni faqat VALIDATSIYA qiladi (yaroqsiz qiymat 400 beradi).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  branchId?: number;
}
