import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { MockExamsService } from './mock-exams.service';
import { MockExamStatsService } from './mock-exam-stats.service';
import { CreateMockExamDto } from './dto/create-mock-exam.dto';
import { UpdateMockExamDto } from './dto/update-mock-exam.dto';
import { ChangeMockExamStatusDto } from './dto/change-mock-exam-status.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('mock-exams')
export class MockExamsController {
  constructor(
    private readonly mockExamsService: MockExamsService,
    private readonly mockExamStatsService: MockExamStatsService,
  ) {}

  @Get()
  @Can('mock.view')
  list(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.list(companyId, scope);
  }

  @Get('revenue-summary')
  @Can('mock.view')
  revenueSummary(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.revenueSummary(companyId, scope);
  }

  @Get('board')
  @Can('mock.view')
  board(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.board(companyId, scope);
  }

  @Get(':id')
  @Can('mock.view')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.findOne(id, companyId, scope);
  }

  @Get(':id/stats')
  @Can('mock.view')
  stats(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamStatsService.getStats(id, companyId, scope);
  }

  @Post()
  @Can('mock.manage')
  create(
    @Body() dto: CreateMockExamDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.create(dto, companyId, userId, scope);
  }

  @Patch(':id')
  @Can('mock.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMockExamDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.update(id, dto, companyId, userId, scope);
  }

  @Patch(':id/status')
  @Can('mock.manage')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeMockExamStatusDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.changeStatus(
      id,
      dto.status,
      companyId,
      userId,
      scope,
    );
  }

  @Post(':id/regenerate-pdf')
  @Can('mock.manage')
  regeneratePdf(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.regeneratePdf(id, companyId, scope);
  }

  @Post(':id/rebroadcast-results')
  @Can('mock.manage')
  rebroadcastResults(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.rebroadcastResults(id, companyId, scope);
  }

  @Delete(':id')
  @Can('mock.manage')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.remove(id, companyId, userId, scope);
  }
}
