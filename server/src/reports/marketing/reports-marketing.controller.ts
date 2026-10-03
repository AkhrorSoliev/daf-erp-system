import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, CurrentUser } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import {
  isEmptyScope,
  resolveCallerReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { MonthQueryDto } from '../dto/month-query.dto';
import { ReportsMarketingService } from './reports-marketing.service';

/**
 * «Marketing» (spec B1 §3): spend, new students and what they paid, by the
 * ADR-0067 definitions. A money report — CEO and Branch Director only, on its
 * own controller so the reports controller's class default (which admits
 * Administrator) never reaches it.
 */
@Controller('reports/marketing')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director')
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
