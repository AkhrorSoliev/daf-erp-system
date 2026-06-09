import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OutreachService } from './outreach.service';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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

  @Get('removal-queue')
  getRemovalQueue(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.outreach.getRemovalQueue({ userId, companyId, roles });
  }

  @Get('promises')
  getActivePromises(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.outreach.getActivePromises({ userId, companyId, roles });
  }
}
