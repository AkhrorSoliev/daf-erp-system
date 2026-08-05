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
import { CustomFormsService } from './custom-forms.service';
import { CreateCustomFormDto } from './dto/create-custom-form.dto';
import { UpdateCustomFormDto } from './dto/update-custom-form.dto';
import { BranchScope, CurrentUser, Roles } from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

// The PUBLIC submit + schema routes live on `PublicFormsController`, not here.
// They must stay unscoped: a form is filled in by someone with no session at
// all, and its branch comes from the section it routes into.
@Controller('custom-forms')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class CustomFormsController {
  constructor(private readonly service: CustomFormsService) {}

  @Get()
  list(
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.list(companyId, scope);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.findOne(id, companyId, scope);
  }

  @Post()
  create(
    @Body() dto: CreateCustomFormDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.create(dto, companyId, userId, scope);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomFormDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.update(id, dto, companyId, userId, scope);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @BranchScope() scope: ReportBranchIds,
  ) {
    return this.service.remove(id, companyId, userId, scope);
  }
}
