import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BranchScope, CurrentUser, Roles } from '../../common/decorators';
import type { ReportBranchIds } from '../../common/finance/report-branch-scope';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AppActivityQueryDto } from '../dto/app-activity-query.dto';
import {
  CenterStudentsQueryDto,
  sorovniOqi,
} from '../dto/center-students-query.dto';
import { davrniOqi } from '../stats/davr';
import { CenterAppActivityService } from './center-app-activity.service';

/**
 * «DaF ilovasi» bo'limi — markaz bo'yicha ilova faolligi (dizayn 9.1).
 *
 * Filial: `@BranchScope()` — sarlavhadagi tanlov ∩ ruxsat, guard hisoblaydi.
 * Shuning uchun bu route'lar `branch-route-policy.ts` manifestiga
 * YOZILMAYDI: dekorator manbada o'zi dalil, manifest testi qayta e'lonni rad
 * etadi. O'qituvchi bu bo'limni ko'rmaydi — u guruh tabidan foydalanadi.
 */
@Controller('app-activity/center')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class CenterAppActivityController {
  constructor(private readonly markaz: CenterAppActivityService) {}

  @Get('summary')
  umumiy(
    @Query() query: AppActivityQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.markaz.umumiy(
      companyId,
      scope,
      davrniOqi(query.period),
      new Date(),
    );
  }

  @Get('students')
  oquvchilar(
    @Query() query: CenterStudentsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.markaz.oquvchilar(
      companyId,
      scope,
      sorovniOqi(query),
      new Date(),
    );
  }

  @Get('students/phones')
  telefonlar(
    @Query() query: CenterStudentsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.markaz.telefonlar(
      companyId,
      scope,
      sorovniOqi(query),
      new Date(),
    );
  }
}
