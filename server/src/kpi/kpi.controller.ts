import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can, CeoOnly } from '../common/permissions/access.decorators';
import { KpiReadService } from './kpi-read.service';
import { KpiSettingsService } from './kpi-settings.service';
import { KpiMonthQueryDto, KpiOverviewQueryDto } from './dto/kpi-query.dto';
import { KpiSettingsDto } from './dto/kpi-settings.dto';
import { KpiUserIdPipe } from './dto/kpi-user-id.pipe';

/** «Xodimlar KPI» (ADR-0094, spec §7.10). No money: these routes only read and set prices. */
@Controller('kpi')
export class KpiController {
  constructor(
    private read: KpiReadService,
    private kpiSettings: KpiSettingsService,
  ) {}

  @Get('overview')
  @Can('kpi.view')
  overview(
    @Query() q: KpiOverviewQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.read.overview(companyId, scope, q);
  }

  @Get('users/:id')
  @Can('kpi.view')
  user(
    @Param('id', KpiUserIdPipe) id: number,
    @Query() q: KpiMonthQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.read.user(companyId, scope, id, q);
  }

  @Get('settings')
  @Can('kpi.view')
  getSettings(@CurrentUser('companyId') companyId: number) {
    return this.kpiSettings.read(companyId);
  }

  @Patch('settings')
  @CeoOnly()
  setSettings(
    @Body() dto: KpiSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.kpiSettings.update(companyId, dto, userId);
  }
}
