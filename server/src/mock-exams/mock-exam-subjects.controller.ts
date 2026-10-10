import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MockExamSubjectsService } from './mock-exam-subjects.service';
import { CreateMockExamSubjectDto } from './dto/create-mock-exam-subject.dto';
import { UpdateMockExamSubjectDto } from './dto/update-mock-exam-subject.dto';
import { ReorderMockExamSubjectsDto } from './dto/reorder-mock-exam-subjects.dto';
import { BranchScope, CurrentUser } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller()
export class MockExamSubjectsController {
  constructor(private readonly subjectsService: MockExamSubjectsService) {}

  @Get('mock-exams/:examId/subjects')
  @Can('mock.view')
  list(
    @Param('examId') examId: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.subjectsService.list(examId, companyId, branchIds);
  }

  @Post('mock-exams/:examId/subjects')
  @Can('mock.manage')
  create(
    @Param('examId') examId: string,
    @Body() dto: CreateMockExamSubjectDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.subjectsService.create(
      examId,
      dto,
      companyId,
      userId,
      branchIds,
    );
  }

  @Patch('mock-exams/:examId/subjects/reorder')
  @Can('mock.manage')
  reorder(
    @Param('examId') examId: string,
    @Body() dto: ReorderMockExamSubjectsDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.subjectsService.reorder(examId, dto, companyId, branchIds);
  }

  @Patch('mock-exam-subjects/:id')
  @Can('mock.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMockExamSubjectDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.subjectsService.update(id, dto, companyId, userId, branchIds);
  }

  @Delete('mock-exam-subjects/:id')
  @Can('mock.manage')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.subjectsService.remove(id, companyId, userId, branchIds);
  }
}
