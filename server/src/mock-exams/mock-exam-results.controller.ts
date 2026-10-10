import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { MockExamResultsService } from './mock-exam-results.service';
import { BulkEnterScoresDto } from './dto/bulk-enter-scores.dto';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller()
export class MockExamResultsController {
  constructor(private readonly resultsService: MockExamResultsService) {}

  @Get('mock-exams/:examId/results-matrix')
  @Can('mock.view')
  matrix(
    @Param('examId') examId: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.resultsService.matrix(examId, companyId, branchIds);
  }

  @Post('mock-exams/:examId/scores/bulk')
  @Can('mock.manage')
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
  @Can('mock.manage')
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
