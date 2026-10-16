import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can, CeoOnly } from '../../common/permissions/access.decorators';
import { LeadsService } from '../leads.service';
import { LeadOwnershipService } from './lead-ownership.service';
import { AssignLeadOwnerDto } from './dto/assign-lead-owner.dto';
import { LeadOwnershipSettingsDto } from './dto/lead-ownership-settings.dto';
import {
  AssignableQueryDto,
  OwnershipSummaryQueryDto,
} from './dto/lead-ownership-query.dto';

/**
 * A lead's owner (ADR-0092). Registered before `LeadsController`; the two-segment
 * `ownership/*` reads never meet its `:id` routes anyway.
 */
@Controller('leads')
export class LeadOwnershipController {
  constructor(
    private ownership: LeadOwnershipService,
    private leads: LeadsService,
  ) {}

  @Get('ownership/summary')
  @Can('leads.view')
  summary(
    @Query() q: OwnershipSummaryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ownership.summary(companyId, scope, q.period ?? 'month');
  }

  @Get('ownership/assignable')
  @Can('leads.assign')
  assignable(
    @Query() q: AssignableQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ownership.assignable(q.leadId, companyId, scope);
  }

  @Get('ownership/settings')
  @Can('leads.view')
  getSettings(@CurrentUser('companyId') companyId: number) {
    return this.ownership.rules(companyId);
  }

  @Patch('ownership/settings')
  @CeoOnly()
  setSettings(
    @Body() dto: LeadOwnershipSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.ownership.setRules(companyId, dto, userId);
  }

  @Post(':id/claim')
  @Can('leads.claim')
  async claim(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    await this.ownership.claim(id, userId, companyId, scope);
    return this.leads.card(id, companyId);
  }

  @Post(':id/release')
  @Can('leads.claim', 'leads.assign')
  async release(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    await this.ownership.release(id, userId, companyId, scope);
    return this.leads.card(id, companyId);
  }

  @Patch(':id/owner')
  @Can('leads.assign')
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignLeadOwnerDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    await this.ownership.assign(
      id,
      dto.userId ?? null,
      userId,
      companyId,
      scope,
    );
    return this.leads.card(id, companyId);
  }
}
