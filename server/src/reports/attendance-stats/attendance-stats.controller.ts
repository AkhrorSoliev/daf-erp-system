import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BranchScope, CurrentUser } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { Can } from '../../common/permissions/access.decorators';
import { AttendanceStatsService } from './attendance-stats.service';
import {
  AttendanceMissersQueryDto,
  AttendanceStatsQueryDto,
} from './dto/attendance-stats-query.dto';

/**
 * «Davomat» (spec B7c §6). The header branch (`@BranchScope()`) as a list:
 * several branches without a pick are added up; an empty scope is refused in
 * the service. Not listed in `branch-route-policy.ts`.
 */
@Controller('reports/attendance-stats')
export class AttendanceStatsController {
  constructor(private readonly service: AttendanceStatsService) {}

  /** Card, months, weekdays, «Sababli» money, the paged cut, the streak count. CEO and Branch Director. */
  @Get('overview')
  @Can('reports.students')
  overview(
    @Query() q: AttendanceStatsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.overview(companyId, scope, q);
  }

  /** The «ko'p qoldiruvchi» list of one cut row; the dialog asks for it on first open. */
  @Get('missers')
  @Can('reports.students')
  missers(
    @Query() q: AttendanceMissersQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.missers(companyId, scope, q);
  }

  /** The workbook of the same period (same scope, no page). */
  @Get('excel')
  @Can('reports.students')
  async excel(
    @Query() q: AttendanceStatsQueryDto,
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
