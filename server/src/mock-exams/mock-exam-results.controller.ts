import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MockExamResultsService } from './mock-exam-results.service';
import { BulkEnterScoresDto } from './dto/bulk-enter-scores.dto';
import { BranchScope, CurrentUser, Roles } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller()
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class MockExamResultsController {
  constructor(private readonly resultsService: MockExamResultsService) {}

  @Get('mock-exams/:examId/results-matrix')
  matrix(
    @Param('examId') examId: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.resultsService.matrix(examId, companyId, branchIds);
  }

  @Post('mock-exams/:examId/scores/bulk')
  bulkSave(
    @Param('examId') examId: string,
    @Body() dto: BulkEnterScoresDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.resultsService.bulkSave(
      examId,
      dto,
      companyId,
      userId,
      branchIds,
    );
  }

  @Post('mock-exams/:examId/recalculate-ranks')
  recalculateRanks(
    @Param('examId') examId: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.resultsService.recalculateRanks(
      examId,
      companyId,
      userId,
      branchIds,
    );
  }
}
