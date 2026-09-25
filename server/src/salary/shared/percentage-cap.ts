import { BadRequestException } from '@nestjs/common';
import { SalaryType } from '@prisma/client';

/**
 * A `PERCENTAGE` rate above 100 is never valid — nobody earns more than the
 * lesson itself costs. Shared by every salary-config write path
 * (`createConfig`, `updateConfig`, `applyGlobalConfig`) so the cap cannot
 * drift between them, and it applies to every caller, including the CEO.
 */
export function assertPercentageWithinCap(
  salaryType: SalaryType,
  value: number,
): void {
  if (salaryType === SalaryType.PERCENTAGE && value > 100) {
    throw new BadRequestException('Foiz 100 dan oshmasligi kerak');
  }
}
