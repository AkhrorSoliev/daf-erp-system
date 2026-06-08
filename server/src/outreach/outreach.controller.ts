import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OutreachService } from './outreach.service';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CallbacksQueryDto } from './dto/callbacks-query.dto';
import { TodayAbsenteesQueryDto } from './dto/today-absentees-query.dto';

@Controller('outreach')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class OutreachController {
  constructor(private outreach: OutreachService) {}

  @Get('stats')
  getStats(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.outreach.getStats({ userId, companyId, roles });
  }

  @Get('today-absentees')
  getTodayAbsentees(
    @Query() query: TodayAbsenteesQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.outreach.getTodayAbsentees({
      userId,
      companyId,
      roles,
      date: query.date,
    });
  }

  @Get('my-callbacks')
  getMyCallbacks(
    @Query() query: CallbacksQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.outreach.getMyCallbacks({ userId, companyId, query });
  }

  @Get('removal-queue')
  getRemovalQueue(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.outreach.getRemovalQueue({ userId, companyId, roles });
  }

  @Get('overdue-promises')
  getOverduePromises(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.outreach.getOverduePromises({ userId, companyId, roles });
  }
}
