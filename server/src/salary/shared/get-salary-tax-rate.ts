import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_SALARY_TAX_RATE } from '../tax.helper';

/**
 * Fetch per-company salary tax rate, falling back to the Uzbekistan default
 * (12% ASOT) when no config row exists or the row is disabled.
 */
export async function getSalaryTaxRate(
  prisma: PrismaService,
  companyId: number,
): Promise<number> {
  const config = await prisma.companyTaxConfig.findUnique({
    where: { companyId },
    select: { salaryTaxRate: true, isActive: true },
  });
  if (!config || !config.isActive) return DEFAULT_SALARY_TAX_RATE;
  return config.salaryTaxRate;
}
