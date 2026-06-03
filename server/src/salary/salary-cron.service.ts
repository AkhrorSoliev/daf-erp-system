import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryService } from './salary.service';
import { isCycleStartDayForCompany } from './shared/resolve-current-period';

@Injectable()
export class SalaryCronService {
  private readonly logger = new Logger(SalaryCronService.name);

  constructor(
    private prisma: PrismaService,
    private salaryService: SalaryService,
  ) {}

  /**
   * Auto-calculate monthly salaries.
   *
   * Faza 2 makes the cycle start day per-company configurable. The cron now
   * runs DAILY at 02:00 Tashkent and asks the resolver for each company:
   * "is today your cycleStartDay?". Only matching companies get their
   * calculation. This way a company that switches from 8→1 takes effect on
   * the next 1st without redeploying or re-scheduling the cron.
   *
   * On the cycleStartDay the cron settles the period that just FINISHED
   * (yesterday was its last day) — see `resolveCompletedPeriod`. Firing on
   * the start day is intentional: payroll is "pay for the cycle that just
   * closed", so the teacher is paid on the very first day of the new cycle.
   */
  @Cron('0 2 * * *', { timeZone: 'Asia/Tashkent' })
  async calculateMonthlySalaries() {
    const now = new Date();
    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });

    let ran = 0;
    for (const company of companies) {
      try {
        const isStartDay = await isCycleStartDayForCompany(
          this.prisma,
          company.id,
          now,
        );
        if (!isStartDay) continue;

        const result = await this.salaryService.calculateMonthlySalaries(
          company.id,
        );
        this.logger.log(
          `Company ${company.id}: calculated ${result.calculated} employee salaries`,
        );
        ran++;
      } catch (error) {
        this.logger.error(
          `Company ${company.id}: salary calculation failed`,
          error,
        );
      }
    }

    if (ran > 0) {
      this.logger.log(
        `Monthly salary calculation completed for ${ran} company(ies)`,
      );
    }
  }
}
