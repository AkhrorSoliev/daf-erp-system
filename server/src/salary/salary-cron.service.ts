import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SalaryService } from './salary.service';

@Injectable()
export class SalaryCronService {
  private readonly logger = new Logger(SalaryCronService.name);

  constructor(
    private prisma: PrismaService,
    private salaryService: SalaryService,
  ) {}

  /**
   * Auto-calculate monthly salaries on the 8th of each month at 2:00 AM Tashkent time.
   * Cutoff date: 7th of current month.
   * Accruals from 8th onward go to next month's calculation.
   */
  @Cron('0 2 8 * *', { timeZone: 'Asia/Tashkent' })
  async calculateMonthlySalaries() {
    this.logger.log('Starting monthly salary calculation...');

    const companies = await this.prisma.company.findMany({
      select: { id: true },
    });

    for (const company of companies) {
      try {
        const result = await this.salaryService.calculateMonthlySalaries(
          company.id,
        );
        this.logger.log(
          `Company ${company.id}: calculated ${result.calculated} employee salaries`,
        );
      } catch (error) {
        this.logger.error(
          `Company ${company.id}: salary calculation failed`,
          error,
        );
      }
    }

    this.logger.log('Monthly salary calculation completed');
  }
}
