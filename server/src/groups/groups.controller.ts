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
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('groups')
export class GroupsController {
  constructor(private groupsService: GroupsService) {}

  @Get()
  findAll(@Query() query: GroupQueryDto, @CurrentUser() currentUser: any) {
    const roles: string[] = currentUser.roles ?? [];
    const isTeacherOnly =
      roles.includes('Teacher') &&
      !roles.some((r) => ['CEO', 'Branch Director', 'Administrator'].includes(r));
    if (isTeacherOnly) {
      query.teacher_id = currentUser.id;
    }
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
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupsService.getScheduleConflicts({
      branchId: Number(branchId),
      exactDays: days,
      startTime,
      endTime,
      roomId: roomId || undefined,
      teacherId: teacherId ? Number(teacherId) : undefined,
      excludeGroupId: excludeGroupId || undefined,
    });
  }

  @Get('available-rooms')
  getAvailableRooms(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupsService.getAvailableRooms({
      branchId: Number(branchId),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
    });
  }

  @Get('available-teachers')
  getAvailableTeachers(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupsService.getAvailableTeachers({
      branchId: Number(branchId),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
    });
  }

  @Get('available-slots')
  getAvailableSlots(
    @Query('branchId') branchId: string,
    @Query('roomId') roomId: string,
    @Query('exactDays') exactDays: string,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupsService.getAvailableSlots({
      branchId: Number(branchId),
      roomId,
      exactDays: days,
      excludeGroupId: excludeGroupId || undefined,
    });
  }

  @Get('next-name')
  getNextName(
    @Query('branchId') branchId: string,
  ) {
    return this.groupsService.getNextName(Number(branchId));
  }

  @Get(':id/students')
  findStudentsByGroupId(@Param('id') id: string) {
    return this.groupsService.findStudentsByGroupId(id);
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
    @CurrentUser('id') userId: number,
  ) {
    return this.groupsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.groupsService.update(id, dto, userId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeGroupStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.groupsService.changeStatus(id, dto, userId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(@Param('id') id: string) {
    return this.groupsService.getStatusHistory(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(@Param('id') id: string, @CurrentUser('id') userId: number) {
    return this.groupsService.delete(id, userId);
  }
}
