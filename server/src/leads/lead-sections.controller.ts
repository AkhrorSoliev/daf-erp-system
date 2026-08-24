import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LeadSectionsService } from './lead-sections.service';
import { LeadsArchiveService } from './leads-archive.service';
import { CreateLeadSectionDto } from './dto/create-lead-section.dto';
import { UpdateLeadSectionDto } from './dto/update-lead-section.dto';
import { MoveLeadSectionDto } from './dto/move-lead-section.dto';
import { ReorderLeadSectionsDto } from './dto/reorder-lead-sections.dto';
import { RestoreLeadSectionDto } from './dto/restore-lead-section.dto';
import { BranchScope, CurrentUser, Roles } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

@Controller('lead-sections')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class LeadSectionsController {
  constructor(
    private readonly leadSectionsService: LeadSectionsService,
    private readonly archiveService: LeadsArchiveService,
  ) {}

  @Post()
  create(
    @Body() dto: CreateLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadSectionsService.create(dto, companyId, userId, scope);
  }

  // Declared before ':id' so "/lead-sections/reorder" is not captured as an id.
  @Patch('reorder')
  reorder(
    @Body() dto: ReorderLeadSectionsDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadSectionsService.reorder(dto, companyId, scope);
  }

  // Declared before ':id' so "/lead-sections/:id/move" resolves to this handler.
  @Patch(':id/move')
  moveToColumn(
    @Param('id') id: string,
    @Body() dto: MoveLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadSectionsService.move(id, dto, companyId, userId, scope);
  }

  // Restores an archived section into a column, optionally with its leads.
  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @Body() dto: RestoreLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.archiveService.restoreSection(
      id,
      dto,
      companyId,
      userId,
      scope,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadSectionsService.update(id, dto, companyId, userId, scope);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.leadSectionsService.remove(id, companyId, userId, scope);
  }
}
