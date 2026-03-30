import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { HolidaysService } from './holidays.service';
import { ChangeHolidayStatusDto } from './dto/change-holiday-status.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('holidays')
export class HolidaysController {
  constructor(private holidaysService: HolidaysService) {}

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
