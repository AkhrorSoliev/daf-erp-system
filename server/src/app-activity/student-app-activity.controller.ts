import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { assertCallerMayTouchStudent } from '../common/auth/student-branch-scope';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AppActivityStatsService } from './app-activity-stats.service';
import { AppActivityQueryDto } from './dto/app-activity-query.dto';
import { davrniOqi } from './stats/davr';

/** O'quvchi profili → «Ilova» tabi (dizayn 6.1). O'qituvchi profilga kirmaydi. */
@Controller('students')
export class StudentAppActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: AppActivityStatsService,
  ) {}

  @Get(':id/app-activity')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  async oquvchi(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: AppActivityQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchStudent(this.prisma, userId, id, companyId);
    return this.stats.oquvchiFaolligi(
      id,
      companyId,
      davrniOqi(query.period),
      new Date(),
    );
  }
}
