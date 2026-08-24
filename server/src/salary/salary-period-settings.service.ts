import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateSalaryPeriodSettingDto } from './dto/salary-period-setting.dto';
import {
  computePeriodBounds,
  parseTashkentDateStart,
  tashkentStartOfToday,
} from './shared/resolve-current-period';

@Injectable()
export class SalaryPeriodSettingsService {
  constructor(private prisma: PrismaService) {}

  /**
   * History of period settings for the company, newest first. Includes the
   * currently-effective row and any past entries — used by the salary
   * settings page in the admin UI.
   */
  async list(companyId: number) {
    return this.prisma.salaryPeriodSetting.findMany({
      where: { companyId },
      orderBy: { effectiveFrom: 'desc' },
      select: {
        id: true,
        cycleStartDay: true,
        effectiveFrom: true,
        effectiveTo: true,
        createdAt: true,
        changedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Append a new period setting. Closes the previous open setting (sets
   * its `effectiveTo` to the new `effectiveFrom`). New cycleStartDay must
   * be in [1,28] and `effectiveFrom` must be ≥ the current open setting's.
   */
  async create(
    dto: CreateSalaryPeriodSettingDto,
    companyId: number,
    changedById: number,
  ) {
    const requestedFrom = this.parseEffectiveFrom(dto.effectiveFrom);

    return this.prisma.$transaction(
      async (tx) => {
        const open = await tx.salaryPeriodSetting.findFirst({
          where: { companyId, effectiveTo: null },
          orderBy: { effectiveFrom: 'desc' },
        });
        if (open && requestedFrom <= open.effectiveFrom) {
          throw new BadRequestException(
            `Yangi sana eski sozlamadan keyin bo'lishi kerak (${open.effectiveFrom.toISOString().slice(0, 10)} dan keyin)`,
          );
        }

        // P1.4 — Mid-cycle cutover policy: if the requested effectiveFrom
        // falls inside the currently-running cycle (under the OLD
        // cycleStartDay), defer the new setting to the start of the NEXT
        // cycle on the old schedule. Otherwise the cron would partway
        // through one period switch its idea of "what month is this?",
        // which the rejection criteria called out as unsafe.
        let effectiveFrom = requestedFrom;
        if (open) {
          const { periodStart, periodEnd } = computePeriodBounds(
            requestedFrom,
            open.cycleStartDay,
          );
          // Inside the currently-running cycle?
          if (requestedFrom >= periodStart && requestedFrom <= periodEnd) {
            // periodEnd is inclusive (last ms of last day); the next cycle
            // starts immediately after.
            effectiveFrom = new Date(periodEnd.getTime() + 1);
          }
        }

        if (open) {
          await tx.salaryPeriodSetting.update({
            where: { id: open.id },
            data: { effectiveTo: effectiveFrom },
          });
        }
        return tx.salaryPeriodSetting.create({
          data: {
            companyId,
            cycleStartDay: dto.cycleStartDay,
            effectiveFrom,
            effectiveTo: null,
            changedById,
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  /**
   * Was a correct copy of the same two lines `SalaryConfigService` had a broken
   * copy of. Both now delegate to the shared helpers, so a period boundary and
   * the rate version that has to align with it cannot be computed differently.
   */
  private parseEffectiveFrom(input?: string): Date {
    return input ? parseTashkentDateStart(input) : tashkentStartOfToday();
  }
}
