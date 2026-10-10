import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { ChangeHolidayStatusDto } from './dto/change-holiday-status.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';
import { BranchScope, CurrentUser } from '../common/decorators';
import { AnyStaff, Can } from '../common/permissions/access.decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('holidays')
export class HolidaysController {
  constructor(private holidaysService: HolidaysService) {}

  // Staff only + company-scoped. Both were missing: any authenticated token,
  // including a student-portal one, could read every holiday in the database.
  // The header's branch scope narrows it further: the centre-wide holidays and
  // the scope's own branches, never another branch's (CEO decision 10.10.2026).
  @Get()
  @AnyStaff()
  findAll(
    @Query() query: HolidayQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchIds: ReportBranchIds,
  ) {
    return this.holidaysService.findAll(query, companyId, branchIds);
  }

  // Staff only + company-scoped — the same two things `findAll` above was
  // given. This route kept neither: with only the global `JwtAuthGuard` in
  // front of it, any valid token including a student-portal one could read any
  // holiday in the database by id.
  @Get(':id')
  @AnyStaff()
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.holidaysService.findOne(id, companyId, userId);
  }

  @Post()
  @Can('settings.reference')
  create(
    @Body() dto: CreateHolidayDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.create(dto, userId, companyId);
  }

  @Patch(':id')
  @Can('settings.reference')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHolidayDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.update(id, dto, userId, companyId);
  }

  @Delete(':id')
  @Can('settings.reference')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.remove(id, userId, companyId);
  }

  @Patch(':id/status')
  @Can('settings.reference')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeHolidayStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @Can('settings.reference')
  getStatusHistory(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.holidaysService.getStatusHistory(id, companyId, userId);
  }
}
