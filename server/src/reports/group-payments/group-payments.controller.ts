import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import {
  GroupDrawerQueryDto,
  GroupPaymentsFilterDto,
  GroupPaymentsQueryDto,
} from './dto/group-payments-query.dto';
import { GroupPaymentsService } from './group-payments.service';

/**
 * «Guruhlar bo'yicha to'lov» (spec B5 §5). The header branch (`@BranchScope()`)
 * as a list: several branches without a pick are added up; an empty scope is
 * refused in the service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/group-payments')
export class GroupPaymentsController {
  constructor(private readonly service: GroupPaymentsService) {}

  /** The card and the table (spec B5 §5.2). The Administrator reads it too (`reports.payments`). */
  @Get()
  @Can('reports.payments')
  rows(
    @Query() q: GroupPaymentsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.rows(companyId, scope, q);
  }

  /** The table of the open cut, every page, and every student line (spec B5 §5.4). */
  @Get('excel')
  @Can('reports.payments')
  async excel(
    @Query() q: GroupPaymentsFilterDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.service.excel(companyId, scope, q);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }

  /** The group drawer (spec B5 §5.3). A group without a charge this month is a 404. */
  @Get('groups/:groupId')
  @Can('reports.payments')
  group(
    @Param('groupId') groupId: string,
    @Query() q: GroupDrawerQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.group(companyId, scope, groupId, q.oy);
  }
}
