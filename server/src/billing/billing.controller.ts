import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
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

  /**
   * Manual catch-up endpoint. Settles every still-unpaid PRESENT/LATE/ABSENT
   * attendance for a student by reusing the same fullCycle/partial billing
   * logic the live attendance flow uses. Idempotent — calling it again on a
   * student with nothing left to settle is a no-op.
   *
   * Use cases:
   *   - Migration / legacy data cleanup: students who had unpaid attendance
   *     before this feature shipped.
   *   - Recovery: an admin notices a salary accrual was missed and wants to
   *     force a recompute after the student tops up.
   *
   * The regular payment pipeline already invokes this automatically, so
   * this endpoint is mostly for one-off corrections.
   */
  @Post('retroactive/:studentId')
  @Roles('CEO', 'Branch Director', 'Administrator')
  runRetroactiveBilling(
    @Param('studentId', ParseIntPipe) studentId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.lessonBillingService.runRetroactiveBilling({
      studentId,
      companyId,
      performedById: userId,
    });
  }
}
