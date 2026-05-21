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
import { LeadSourcesService } from './lead-sources.service';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('lead-sources')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class LeadSourcesController {
  constructor(private readonly leadSourcesService: LeadSourcesService) {}

  @Get()
  findAll() {
    return this.leadSourcesService.findAll();
  }

  // Filter-bar sources: active + soft-deleted-but-still-used (with a flag).
  @Get('filter')
  findAllForFilter() {
    return this.leadSourcesService.findAllForFilter();
  }

  @Post()
  create(
    @Body() dto: CreateLeadSourceDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSourcesService.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadSourceDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSourcesService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadSourcesService.remove(id, companyId, userId);
  }
}
