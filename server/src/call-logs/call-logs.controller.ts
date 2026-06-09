import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CallLogsService } from './call-logs.service';
import { CreateCallLogDto } from './dto/create-call-log.dto';
import { ListCallLogsQueryDto } from './dto/list-call-logs-query.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('call-logs')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class CallLogsController {
  constructor(private readonly callLogs: CallLogsService) {}

  @Post()
  create(
    @Body() dto: CreateCallLogDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.callLogs.create(dto, userId, companyId);
  }

  @Get()
  list(
    @Query() query: ListCallLogsQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.callLogs.list({ userId, companyId, roles, query });
  }
}
