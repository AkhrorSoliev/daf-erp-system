import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupQueryDto } from './dto/group-query.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('groups')
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Get()
  findAll(@Query() query: GroupQueryDto) {
    return this.groupsService.findAll(query);
  }

  @Get('schedule-conflicts')
  getScheduleConflicts(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('roomId') roomId?: string,
    @Query('teacherId') teacherId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupsService.getScheduleConflicts({
      branchId: Number(branchId),
      exactDays: days,
      startTime,
      endTime,
      roomId: roomId || undefined,
      teacherId: teacherId ? Number(teacherId) : undefined,
    });
  }

  @Get('next-name')
  getNextName(
    @Query('level') level: string,
    @Query('branchId') branchId: string,
  ) {
    return this.groupsService.getNextName(level, Number(branchId));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groupsService.findOne(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateGroupDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.create(dto, companyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(@Param('id') id: string, @Body() dto: UpdateGroupDto) {
    return this.groupsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.groupsService.delete(id, userId);
  }
}
