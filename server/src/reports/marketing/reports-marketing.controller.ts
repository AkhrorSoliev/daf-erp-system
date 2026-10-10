import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators';
import { Can } from '../../common/permissions/access.decorators';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isEmptyScope,
  resolveCallerReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { MonthQueryDto } from '../dto/month-query.dto';
import { ReportsMarketingService } from './reports-marketing.service';

/**
 * «Marketing» (spec B1 §3): spend, new students and what they paid, by the
 * ADR-0067 definitions. A money report: it needs the finance report
 * capability (`reports.finance`), which only the CEO and the Branch Director
 * hold by default.
 */
@Controller('reports/marketing')
@Can('reports.finance')
export class ReportsMarketingController {
  constructor(
    private readonly marketing: ReportsMarketingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async getMarketing(
    @Query() query: MonthQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    // ONE scope for every leg: the caller's ceiling narrowed by the header's
    // pick. An empty one is refused, never answered with zeros (ADR-0002).
    const branchIds = await resolveCallerReportBranchIds(
      this.prisma,
      userId,
      query.branchId,
    );
    if (isEmptyScope(branchIds)) {
      throw new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      );
    }
    return this.marketing.getMarketing(companyId, {
      month: query.month,
      branchIds,
    });
  }
}
