import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { CenterActivityService } from './center-activity.service';
import { CenterActivityQueryDto } from './dto/center-activity-query.dto';

/**
 * «Markaz faoliyati» (spec B7b §5). The header branch (`@BranchScope()`) as a
 * list: several branches without a pick are added up; an empty scope is refused
 * in the service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/center-activity')
export class CenterActivityController {
  constructor(private readonly service: CenterActivityService) {}

  /** Cards, free-rooms table, rooms, groups with free seats, month bars. CEO and Branch Director (`reports.students`). */
  @Get('overview')
  @Can('reports.students')
  overview(
    @Query() q: CenterActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.overview(companyId, scope, q);
  }

  /** The workbook of the same month (same scope, no page). */
  @Get('excel')
  @Can('reports.students')
  async excel(
    @Query() q: CenterActivityQueryDto,
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
}
