import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { ChangeHolidayStatusDto } from './dto/change-holiday-status.dto';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { UpdateHolidayDto } from './dto/update-holiday.dto';
import { HolidayQueryDto } from './dto/holiday-query.dto';
import { CurrentUser, Roles, STAFF_ROLES } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('holidays')
export class HolidaysController {
  constructor(private holidaysService: HolidaysService) {}

  // Staff only + company-scoped. Both were missing: any authenticated token,
  // including a student-portal one, could read every holiday in the database.
  @Get()
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  findAll(
    @Query() query: HolidayQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.findAll(query, companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.holidaysService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateHolidayDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.holidaysService.create(dto, userId, companyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateHolidayDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.holidaysService.update(id, dto, userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
  ) {
    return this.holidaysService.remove(id, userId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeHolidayStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.holidaysService.changeStatus(id, dto, userId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(@Param('id') id: string) {
    return this.holidaysService.getStatusHistory(id);
  }
}
