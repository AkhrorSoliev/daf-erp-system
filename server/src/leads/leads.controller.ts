import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsBoardService } from './leads-board.service';
import { LeadsArchiveService } from './leads-archive.service';
import { LeadsStatsService } from './leads-stats.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { MoveLeadDto } from './dto/move-lead.dto';
import { ReorderLeadsDto } from './dto/reorder-leads.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { MarkCalledLeadDto } from './dto/mark-called-lead.dto';
import { RestoreLeadDto } from './dto/restore-lead.dto';
import { RemoveLeadDto } from './dto/remove-lead.dto';
import { LeadStatsQueryDto } from './dto/lead-stats-query.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { Can } from '../common/permissions/access.decorators';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly boardService: LeadsBoardService,
    private readonly archiveService: LeadsArchiveService,
    private readonly statsService: LeadsStatsService,
  ) {}

  // Filtered, paginated flat list — used by the filter view.
  @Get()
  @Can('leads.view')
  findAll(
    @Query() query: LeadQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.findAll(query, companyId, scope);
  }

  // Full board: columns -> sections -> per-section lead counts.
  // Declared before ':id' so "/leads/board" is not captured as an id.
  @Get('board')
  @Can('leads.view')
  getBoard(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.boardService.getBoard(companyId, scope);
  }

  // Figures above the board. Declared before ':id' so "/leads/stats" is not
  // captured as an id.
  @Get('stats')
  @Can('leads.view')
  getStats(
    @Query() query: LeadStatsQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.statsService.getStats(companyId, scope, query.period);
  }

  // Archived leads + sections (two-column leads archive). Declared before ':id'
  // so "/leads/archive" is not captured as an id.
  @Get('archive')
  @Can('leads.view')
  getArchive(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.archiveService.getArchive(companyId, scope);
  }

  // Lazily loaded when a section is expanded on the board.
  @Get('sections/:sectionId/leads')
  @Can('leads.view')
  getSectionLeads(
    @Param('sectionId') sectionId: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.getSectionLeads(sectionId, companyId, scope);
  }

  // Lazy hover preview (caller + latest comment). Declared before ':id' so the
  // extra path segment isn't swallowed by the generic detail route.
  @Get(':id/hover-summary')
  @Can('leads.view')
  getHoverSummary(@Param('id') id: string) {
    return this.leadsService.getHoverSummary(id);
  }

  // Leads converted into a given student — powers the student profile "Lid
  // tarixi" tab. Declared before ':id' so the segment isn't captured as a lead
  // id. studentId is a numeric student id, not a lead uuid.
  @Get('by-student/:studentId')
  @Can('leads.view', 'students.details')
  findByStudentId(@Param('studentId', ParseIntPipe) studentId: number) {
    return this.leadsService.findByStudentId(studentId);
  }

  @Get(':id')
  @Can('leads.view')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.findOne(id, companyId, scope);
  }

  @Post()
  @Can('leads.manage')
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    // No `@BranchScope()`: the branch comes from the chosen section's column,
    // and `getBoard` already only offered sections this caller can reach.
    return this.leadsService.create(dto, companyId, userId);
  }

  // Declared before ':id/move' and ':id' so "/leads/reorder" is not captured
  // as an id. Reorders the leads within one section (pure ordering).
  @Patch('reorder')
  @Can('leads.manage')
  reorder(@Body() dto: ReorderLeadsDto) {
    return this.leadsService.reorder(dto);
  }

  // Declared before ':id' so "/leads/:id/move" resolves to the move handler.
  @Patch(':id/move')
  @Can('leads.manage')
  move(
    @Param('id') id: string,
    @Body() dto: MoveLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.move(id, dto, companyId, userId, scope);
  }

  // Toggle the "called" marker — declared before ':id' so it resolves here.
  @Patch(':id/called')
  @Can('leads.manage', 'leads.forms')
  markCalled(
    @Param('id') id: string,
    @Body() dto: MarkCalledLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.markCalled(id, dto, companyId, userId, scope);
  }

  @Post(':id/convert')
  @Can('leads.manage')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.convert(id, dto, companyId, userId, scope);
  }

  // Restores an archived lead into a chosen column + section.
  @Post(':id/restore')
  @Can('leads.manage')
  restore(
    @Param('id') id: string,
    @Body() dto: RestoreLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.archiveService.restoreLead(id, dto, companyId, userId, scope);
  }

  @Patch(':id')
  @Can('leads.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.update(id, dto, companyId, userId, scope);
  }

  // Deleting a lead marks it LOST with a mandatory reason (sent in the body)
  // and archives it. The reason is surfaced in the leads archive + audit trail.
  @Delete(':id')
  @Can('leads.manage')
  remove(
    @Param('id') id: string,
    @Body() dto: RemoveLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadsService.remove(id, dto, companyId, userId, scope);
  }
}
