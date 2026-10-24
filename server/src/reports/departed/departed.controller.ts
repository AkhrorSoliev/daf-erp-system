import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { DepartedListService } from './departed-list.service';
import { DepartedOverviewService } from './departed-overview.service';
import {
  DepartedFilterDto,
  DepartedListQueryDto,
} from './dto/departed-query.dto';

/**
 * «Ketgan o'quvchilar» (spec B7a). The header branch (`@BranchScope()`) as a
 * list; an empty scope is refused in the service.
 */
@Controller('reports/departed-students')
export class DepartedController {
  constructor(
    private readonly overviewService: DepartedOverviewService,
    private readonly listService: DepartedListService,
  ) {}

  /** The cards, months, reasons and cuts (spec B7a §4). */
  @Get('overview')
  @Can('reports.students')
  overview(
    @Query() q: DepartedFilterDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.overviewService.overview(companyId, scope, q);
  }

  /** The table: search, reason, state, debt switch and the page (spec B7a §5). */
  @Get('list')
  @Can('reports.students')
  list(
    @Query() q: DepartedListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.listService.list(companyId, scope, q);
  }

  /** The table's filters without the page, as a workbook (spec B7a §5). */
  @Get('excel')
  @Can('reports.students')
  async excel(
    @Query() q: DepartedListQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.listService.excel(
      companyId,
      scope,
      q,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  }
}
