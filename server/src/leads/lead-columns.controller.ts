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
import { CurrentUser, Roles } from '../common/decorators';
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
  ) {
    return this.leadColumnsService.create(dto, companyId, userId);
  }

  // Declared before ':id' so "/lead-columns/reorder" is not captured as an id.
  @Patch('reorder')
  reorder(@Body() dto: ReorderLeadColumnsDto) {
    return this.leadColumnsService.reorder(dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeadColumnDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadColumnsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leadColumnsService.remove(id, companyId, userId);
  }
}
