import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { LessonBillingService } from './lesson-billing.service';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import { ReverseConsumptionDto } from '../transactions/dto/reverse-consumption.dto';

/**
 * Q4 — Admin-only correction endpoint for un-billing a LESSON_DEDUCTION
 * batch. Distinct from the regular attendance flip path (which handles
 * "this single lesson didn't happen"); this one undoes an entire prepaid
 * batch when the deduction itself was wrong (wrong group, wrong amount,
 * etc). Cascades reversal to every salary accrual the batch covered and
 * resets the enrollment's prepaid counter.
 */
@Controller('billing')
@UseGuards(RolesGuard)
export class BillingController {
  constructor(private lessonBillingService: LessonBillingService) {}

  @Post('lesson-deduction/:id/reverse')
  @Roles('CEO', 'Branch Director')
  reverseLessonDeduction(
    @Param('id') id: string,
    @Body() dto: ReverseConsumptionDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.lessonBillingService.reverseLessonDeduction(id, {
      performedById: userId,
      reason: dto.reason,
      companyId,
    });
  }
}
