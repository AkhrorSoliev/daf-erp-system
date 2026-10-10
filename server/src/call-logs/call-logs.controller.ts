import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CallLogsService } from './call-logs.service';
import { CreateCallLogDto } from './dto/create-call-log.dto';
import { ListCallLogsQueryDto } from './dto/list-call-logs-query.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('call-logs')
export class CallLogsController {
  constructor(private readonly callLogs: CallLogsService) {}

  @Post()
  @Can('calls.log')
  create(
    @Body() dto: CreateCallLogDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.callLogs.create(dto, userId, companyId);
  }

  @Get()
  @Can('outreach.view', 'students.details')
  list(
    @Query() query: ListCallLogsQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.callLogs.list({
      userId,
      companyId,
      roles,
      branchScope,
      query,
    });
  }
}
