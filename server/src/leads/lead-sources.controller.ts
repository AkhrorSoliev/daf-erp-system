import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { LeadSourcesService } from './lead-sources.service';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';

@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leadSourcesService: LeadSourcesService) {}

  @Get()
  @Can('leads.view', 'leads.forms')
  findAll() {
    return this.leadSourcesService.findAll();
  }

  // Filter-bar sources: active + soft-deleted-but-still-used (with a flag).
  @Get('filter')
  @Can('leads.view', 'leads.forms')
  findAllForFilter() {
    return this.leadSourcesService.findAllForFilter();
  }

  @Post()
  @Can('leads.setup')
  create(
    @Body() dto: CreateLeadSourceDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSourcesService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('leads.setup')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadSourceDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSourcesService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  @Can('leads.setup')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSourcesService.remove(id, companyId, userId);
  }
}
