import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchQueryDto } from './dto/branch-query.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ChangeBranchStatusDto } from './dto/change-branch-status.dto';
import { CurrentUser, BranchCeiling } from '../common/decorators';
import { AnyStaff, Can } from '../common/permissions/access.decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('branches')
export class BranchesController {
  constructor(private branchesService: BranchesService) {}

  // Staff only — a student-portal token used to read this too.
  // (branch list feeds the branch switcher and report filter bars.)
  @AnyStaff()
  @Get()
  findAll(
    @Query() query: BranchQueryDto,
    @CurrentUser('companyId') companyId: number,
    // The CEILING, not the current selection — this list IS the switcher's
    // options. Narrowing it by the selected branch would leave the user unable
    // to switch away from whatever they last picked.
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.branchesService.findAll(query, companyId, ceiling);
  }

  // Staff only, same reason as the list above.
  @AnyStaff()
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.branchesService.findOne(id, companyId, ceiling);
  }

  /**
   * Go-live checklist for a branch: cash accounts, working hours, at least one
   * course / room / administrator, and no teacher without a salary rate.
   *
   * Read-only, and deliberately a separate endpoint rather than a gate on
   * `create` — a branch is opened days before its rooms and teachers exist, so
   * refusing to create one until it is complete would be unusable. What must
   * not happen is the branch quietly LOOKING ready while a teacher accrues
   * nothing for every lesson they teach.
   */
  @Can('settings.branches')
  @Get(':id/readiness')
  getReadiness(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.branchesService.getReadiness(id, companyId, userId);
  }

  @Post()
  @Can('settings.branches')
  create(
    @Body() dto: CreateBranchDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.branchesService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('settings.branches')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBranchDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.branchesService.update(id, dto, userId, companyId);
  }

  @Patch(':id/status')
  @Can('settings.branches')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeBranchStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.branchesService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @Can('settings.branches')
  getStatusHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.branchesService.getStatusHistory(id, companyId, userId);
  }
}
