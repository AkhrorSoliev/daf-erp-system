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
import { CurrentUser, Roles } from '../common/decorators';
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
  ) {
    return this.leadSectionsService.create(dto, companyId, userId);
  }

  // Declared before ':id' so "/lead-sections/reorder" is not captured as an id.
  @Patch('reorder')
  reorder(@Body() dto: ReorderLeadSectionsDto) {
    return this.leadSectionsService.reorder(dto);
  }

  // Declared before ':id' so "/lead-sections/:id/move" resolves to this handler.
  @Patch(':id/move')
  moveToColumn(
    @Param('id') id: string,
    @Body() dto: MoveLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSectionsService.move(id, dto, companyId, userId);
  }

  // Restores an archived section into a column, optionally with its leads.
  @Post(':id/restore')
  restore(
    @Param('id') id: string,
    @Body() dto: RestoreLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.archiveService.restoreSection(id, dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadSectionDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSectionsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSectionsService.remove(id, companyId, userId);
  }
}
