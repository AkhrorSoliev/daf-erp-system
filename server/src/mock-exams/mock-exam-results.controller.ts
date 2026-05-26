import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MockExamResultsService } from './mock-exam-results.service';
import { BulkEnterScoresDto } from './dto/bulk-enter-scores.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller()
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class MockExamResultsController {
  constructor(private readonly resultsService: MockExamResultsService) {}

  @Get('mock-exams/:examId/results-matrix')
  matrix(@Param('examId') examId: string) {
    return this.resultsService.matrix(examId);
  }

  @Post('mock-exams/:examId/scores/bulk')
  bulkSave(
    @Param('examId') examId: string,
    @Body() dto: BulkEnterScoresDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.resultsService.bulkSave(examId, dto, companyId, userId);
  }

  @Post('mock-exams/:examId/recalculate-ranks')
  recalculateRanks(
    @Param('examId') examId: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.resultsService.recalculateRanks(examId, companyId, userId);
  }
}
