import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { EntityHistoryService } from './entity-history.service';
import { HistoryQueryDto } from './dto/history-query.dto';
import { CurrentUser, Roles } from '../decorators';
import { RolesGuard } from '../guards';

@Controller('entity-history')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class EntityHistoryController {
  constructor(private entityHistoryService: EntityHistoryService) {}

  @Get(':entityType/:entityId')
  getHistory(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query() query: HistoryQueryDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.entityHistoryService.getHistory(
      entityType,
      entityId,
      companyId,
      {
        page: query.page,
        pageSize: query.pageSize,
      },
      { userId, roles },
    );
  }
}
