import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MockExamParticipantsService } from './mock-exam-participants.service';
import { AddManualParticipantDto } from './dto/add-manual-participant.dto';
import { ConvertMockParticipantDto } from './dto/convert-mock-participant.dto';
import { ParticipantsQueryDto } from './dto/participants-query.dto';
import { MarkMockPaidDto } from './dto/mark-mock-paid.dto';
import { UpdateMockPaymentDto } from './dto/update-mock-payment.dto';
import { CancelMockPaymentDto } from './dto/cancel-mock-payment.dto';
import { RemoveMockParticipantQueryDto } from './dto/remove-mock-participant-query.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller()
export class MockExamParticipantsController {
  constructor(
    private readonly participantsService: MockExamParticipantsService,
  ) {}

  @Get('mock-exams/:examId/participants')
  @Can('mock.view')
  list(
    @Param('examId') examId: string,
    @Query() query: ParticipantsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.participantsService.list(examId, query, companyId, branchIds);
  }

  /** Mock exams a student has participated in — for /students/profile/[id] */
  @Get('students/:studentId/mock-exams')
  @Can('students.details', 'mock.view')
  listForStudent(
    @Param('studentId') studentId: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.participantsService.listForStudent(
      Number(studentId),
      companyId,
      branchIds,
    );
  }

  @Post('mock-exams/:examId/participants/manual')
  @Can('mock.manage')
  addManual(
    @Param('examId') examId: string,
    @Body() dto: AddManualParticipantDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.participantsService.addManual(
      examId,
      dto,
      companyId,
      userId,
      branchIds,
    );
  }

  @Post('mock-exam-participants/:id/mark-paid')
  @Can('mock.payments')
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkMockPaidDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.participantsService.markPaid(
      id,
      dto,
      companyId,
      userId,
      branchIds,
    );
  }

  /** Fix the method or note of a payment an admin accepted by hand. */
  @Patch('mock-exam-participants/:id/payment')
  @Can('mock.payments')
  updatePayment(
    @Param('id') id: string,
    @Body() dto: UpdateMockPaymentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.participantsService.updatePayment(
      id,
      dto,
      companyId,
      userId,
      branchIds,
    );
  }

  /** Undo a payment an admin accepted by hand; `reason` is mandatory. */
  @Post('mock-exam-participants/:id/cancel-payment')
  @Can('mock.payments')
  cancelPayment(
    @Param('id') id: string,
    @Body() dto: CancelMockPaymentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.participantsService.cancelPayment(
      id,
      dto,
      companyId,
      userId,
      branchIds,
    );
  }

  @Post('mock-exam-participants/:id/convert')
  @Can('mock.manage')
  convertToStudent(
    @Param('id') id: string,
    @Body() dto: ConvertMockParticipantDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.participantsService.convertToStudent(
      id,
      dto,
      companyId,
      userId,
      branchIds,
    );
  }

  @Delete('mock-exam-participants/:id')
  @Can('mock.manage')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
    @Query() query: RemoveMockParticipantQueryDto,
  ) {
    return this.participantsService.remove(id, companyId, userId, branchIds, {
      refundConfirmed: query.refundConfirmed,
    });
  }
}
