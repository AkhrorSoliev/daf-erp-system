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
import { CurrentUser } from '../common/decorators';
import { AnyStaff, Can } from '../common/permissions/access.decorators';

@Controller('holidays')
export class HolidaysController {
  constructor(private holidaysService: HolidaysService) {}

  // Staff only + company-scoped. Both were missing: any authenticated token,
  // including a student-portal one, could read every holiday in the database.
  @Get()
  @AnyStaff()
  findAll(
    @Query() query: HolidayQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.findAll(query, companyId);
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
  ) {
    return this.holidaysService.findOne(id, companyId);
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
  ) {
    return this.holidaysService.getStatusHistory(id, companyId);
  }
}
