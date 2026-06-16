import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsBoardService } from './leads-board.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { MoveLeadDto } from './dto/move-lead.dto';
import { LeadQueryDto } from './dto/lead-query.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { MarkCalledLeadDto } from './dto/mark-called-lead.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('leads')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly boardService: LeadsBoardService,
  ) {}

  // Filtered, paginated flat list — used by the filter view.
  @Get()
  findAll(@Query() query: LeadQueryDto) {
    return this.leadsService.findAll(query);
  }

  // Full board: columns -> sections -> per-section lead counts.
  // Declared before ':id' so "/leads/board" is not captured as an id.
  @Get('board')
  getBoard() {
    return this.boardService.getBoard();
  }

  // Lazily loaded when a section is expanded on the board.
  @Get('sections/:sectionId/leads')
  getSectionLeads(@Param('sectionId') sectionId: string) {
    return this.leadsService.getSectionLeads(sectionId);
  }

  // Lazy hover preview (caller + latest comment). Declared before ':id' so the
  // extra path segment isn't swallowed by the generic detail route.
  @Get(':id/hover-summary')
  getHoverSummary(@Param('id') id: string) {
    return this.leadsService.getHoverSummary(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.create(dto, companyId, userId);
  }

  // Declared before ':id' so "/leads/:id/move" resolves to the move handler.
  @Patch(':id/move')
  move(
    @Param('id') id: string,
    @Body() dto: MoveLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.move(id, dto, companyId, userId);
  }

  // Toggle the "called" marker — declared before ':id' so it resolves here.
  @Patch(':id/called')
  markCalled(
    @Param('id') id: string,
    @Body() dto: MarkCalledLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.markCalled(id, dto, companyId, userId);
  }

  @Post(':id/convert')
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.convert(id, dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadsService.remove(id, companyId, userId);
  }
}
