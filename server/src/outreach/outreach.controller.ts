import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OutreachService } from './outreach.service';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CallbacksQueryDto } from './dto/callbacks-query.dto';

@Controller('outreach')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class OutreachController {
  constructor(private outreach: OutreachService) {}

  @Get('today-absentees')
  getTodayAbsentees(
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.outreach.getTodayAbsentees({ userId, companyId, roles });
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
}
