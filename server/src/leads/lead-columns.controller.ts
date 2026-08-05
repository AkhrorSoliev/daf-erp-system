import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LeadColumnsService } from './lead-columns.service';
import { CreateLeadColumnDto } from './dto/create-lead-column.dto';
import { UpdateLeadColumnDto } from './dto/update-lead-column.dto';
import { ReorderLeadColumnsDto } from './dto/reorder-lead-columns.dto';
import { BranchScope, CurrentUser, Roles } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller('lead-columns')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class LeadColumnsController {
  constructor(private readonly leadColumnsService: LeadColumnsService) {}

  @Post()
  create(
    @Body() dto: CreateLeadColumnDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadColumnsService.create(dto, companyId, userId, scope);
  }

  // Declared before ':id' so "/lead-columns/reorder" is not captured as an id.
  @Patch('reorder')
  reorder(
    @Body() dto: ReorderLeadColumnsDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadColumnsService.reorder(dto, companyId, scope);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadColumnDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadColumnsService.update(id, dto, companyId, userId, scope);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadColumnsService.remove(id, companyId, userId, scope);
  }
}
