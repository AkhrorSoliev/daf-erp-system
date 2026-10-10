import { Controller, Get, Param, Query } from '@nestjs/common';
import { EntityHistoryService } from './entity-history.service';
import { HistoryQueryDto } from './dto/history-query.dto';
import { CurrentUser } from '../decorators';
import { Can } from '../permissions/access.decorators';

@Controller('entity-history')
export class EntityHistoryController {
  constructor(private entityHistoryService: EntityHistoryService) {}

  // Every page with a history tab lists its own capability, so turning one
  // page off never breaks another's history.
  @Get(':entityType/:entityId')
  @Can(
    'students.details',
    'groups.manage',
    'teachers.view',
    'employees.view',
    'settings.reference',
    'settings.branches',
    'leads.view',
  )
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
