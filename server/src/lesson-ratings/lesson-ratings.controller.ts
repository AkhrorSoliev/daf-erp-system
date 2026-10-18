import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { CeoOnly } from '../common/permissions/access.decorators';
import {
  RatingLowQueryDto,
  RatingMonthDto,
  RatingSettingsDto,
} from './dto/rating-query.dto';
import { LessonRatingsService } from './lesson-ratings.service';

/**
 * «Dars baholari» (spec 2026-10-13 §6). Faqat CEO — kimlik, imkoniyat emas
 * (`@CeoOnly()`, ADR-0087): baholarni hech kimga berib bo'lmaydi.
 * Marker har handler'da: handler darajasidagi marker klassnikini bosadi.
 */
@Controller('lesson-ratings')
export class LessonRatingsController {
  constructor(private readonly ratings: LessonRatingsService) {}

  @Get('summary')
  @CeoOnly()
  summary(
    @Query() q: RatingMonthDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ratings.summary(companyId, scope, q.month);
  }

  @Get('teachers/:id')
  @CeoOnly()
  teacher(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: RatingMonthDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ratings.teacher(companyId, scope, id, q.month);
  }

  @Get('low')
  @CeoOnly()
  low(
    @Query() q: RatingLowQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.ratings.low(
      companyId,
      scope,
      q.month,
      q.page ?? 1,
      q.pageSize ?? 10,
      q.commented,
    );
  }

  @Patch('settings')
  @CeoOnly()
  setEnabled(
    @Body() dto: RatingSettingsDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.ratings.setEnabled(companyId, dto.enabled, userId);
  }
}
