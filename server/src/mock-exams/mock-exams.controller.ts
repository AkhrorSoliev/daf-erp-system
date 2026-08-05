import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MockExamsService } from './mock-exams.service';
import { CreateMockExamDto } from './dto/create-mock-exam.dto';
import { UpdateMockExamDto } from './dto/update-mock-exam.dto';
import { ChangeMockExamStatusDto } from './dto/change-mock-exam-status.dto';
import { CurrentUser, Roles, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller('mock-exams')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class MockExamsController {
  constructor(private readonly mockExamsService: MockExamsService) {}

  @Get()
  list(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.list(companyId, scope);
  }

  @Get('revenue-summary')
  revenueSummary(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.revenueSummary(companyId, scope);
  }

  @Get('board')
  board(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.board(companyId, scope);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.findOne(id, companyId, scope);
  }

  @Post()
  create(
    @Body() dto: CreateMockExamDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.create(dto, companyId, userId, scope);
  }

  @Patch(':id')
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
  regeneratePdf(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.regeneratePdf(id, companyId, scope);
  }

  @Post(':id/rebroadcast-results')
  rebroadcastResults(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.rebroadcastResults(id, companyId, scope);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.mockExamsService.remove(id, companyId, userId, scope);
  }
}
