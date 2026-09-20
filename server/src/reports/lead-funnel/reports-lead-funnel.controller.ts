import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles, CurrentUser, BranchScope } from '../../common/decorators';
import { RolesGuard } from '../../common/guards';
import {
  isEmptyScope,
  type ReportBranchIds,
} from '../../common/finance/report-branch-scope';
import { ReportsLeadFunnelService } from './reports-lead-funnel.service';
import {
  LeadFunnelPeopleQueryDto,
  LeadFunnelQueryDto,
} from './lead-funnel-query.dto';

/**
 * Lid voronkasi. Pul hisoboti emas, sotuv va operatsion ko'rsatkich —
 * shuning uchun Administrator ham ko'radi (reports kontrollerining umumiy
 * qoidasi bilan bir xil).
 */
@Controller('reports/lead-funnel')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class ReportsLeadFunnelController {
  constructor(private readonly funnel: ReportsLeadFunnelService) {}

  @Get()
  getFunnel(
    @Query() query: LeadFunnelQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    refuseEmpty(scope);
    return this.funnel.getFunnel(companyId, query, scope);
  }

  @Get('people')
  getPeople(
    @Query() query: LeadFunnelPeopleQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    refuseEmpty(scope);
    return this.funnel.getPeople(
      companyId,
      {
        stage: query.stage,
        mode: query.mode ?? 'all',
        startDate: query.startDate,
        endDate: query.endDate,
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 10,
      },
      scope,
    );
  }
}

/**
 * Bo'sh qamrov — ruxsatdan tashqari filial so'ralgan yoki chaqiruvchida filial
 * yo'q. Nollar bilan javob berish «bu filialda hech kim yo'q» deb o'qilardi.
 */
function refuseEmpty(scope: ReportBranchIds) {
  if (isEmptyScope(scope)) {
    throw new ForbiddenException('Bu filial sizning ruxsatingizda emas');
  }
}
