import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { assertCallerMayTouchGroup } from '../common/auth/group-branch-scope';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AppActivityStatsService } from './app-activity-stats.service';
import { AppActivityQueryDto } from './dto/app-activity-query.dto';
import { guruhDarajasi } from './stats/daraja';
import { davrniOqi } from './stats/davr';

const RAD_XABARI =
  "Bu guruh boshqa filialga tegishli — ilova faolligini ko'rish huquqingiz yo'q";

/**
 * Guruh sahifasi → «Ilova faolligi» tabi va o'quvchi yon oynasi (dizayn 6.1).
 * O'qituvchi faqat o'z guruhini ko'radi (`assertCallerMayTouchGroup`).
 */
@Controller('groups')
export class GroupAppActivityController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: AppActivityStatsService,
  ) {}

  @Get(':id/app-activity')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async guruh(
    @Param('id') id: string,
    @Query() query: AppActivityQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchGroup(this.prisma, userId, roles, id, RAD_XABARI);
    return this.stats.guruhFaolligi(
      id,
      companyId,
      davrniOqi(query.period),
      new Date(),
    );
  }

  @Get(':id/app-activity/students/:studentId')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  async oquvchi(
    @Param('id') id: string,
    @Param('studentId', ParseIntPipe) studentId: number,
    @Query() query: AppActivityQueryDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    await assertCallerMayTouchGroup(this.prisma, userId, roles, id, RAD_XABARI);
    await this.stats.guruhAzosiEkaniniTekshir(id, studentId);
    // Jadval (guruhFaolligi) LESSON seansi bo'lmagan o'quvchiga guruh
    // darajasini ko'rsatadi — yon oyna ham SHU guruh darajasini bilib olishi
    // kerak, aks holda ikkisi bir xil o'quvchi uchun ikki xil daraja aytadi
    // (topilma 6). Guard → a'zolik → o'qish tartibi saqlanadi.
    const group = await this.prisma.group.findFirst({
      where: { id, companyId, deletedAt: null },
      select: { level: true },
    });
    return this.stats.oquvchiFaolligi(
      studentId,
      companyId,
      davrniOqi(query.period),
      new Date(),
      guruhDarajasi(group?.level ?? null),
    );
  }
}
