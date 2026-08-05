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
import { GroupScheduleService } from './group-schedule.service';
import { GroupQueryDto } from './dto/group-query.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { CurrentUser, Roles, BranchScope } from '../common/decorators';
import { RolesGuard } from '../common/guards/roles.guard';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('groups')
export class GroupsController {
  constructor(
    private groupsService: GroupsService,
    private groupScheduleService: GroupScheduleService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  findAll(
    @Query() query: GroupQueryDto,
    @CurrentUser() currentUser: any,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    const roles: string[] = currentUser.roles ?? [];
    const isTeacherOnly =
      roles.includes('Teacher') &&
      !roles.some((r) =>
        ['CEO', 'Branch Director', 'Administrator'].includes(r),
      );
    if (isTeacherOnly) {
      query.teacher_id = currentUser.id;
    }
    return this.groupsService.findAll(
      query,
      currentUser.companyId,
      branchScope,
    );
  }

  @Get('schedule-conflicts')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getScheduleConflicts(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @Query('roomId') roomId?: string,
    @Query('teacherId') teacherId?: string,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getScheduleConflicts({
      branchId: Number(branchId),
      exactDays: days,
      startTime,
      endTime,
      roomId: roomId || undefined,
      teacherId: teacherId ? Number(teacherId) : undefined,
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-rooms')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getAvailableRooms(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableRooms({
      branchId: Number(branchId),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-teachers')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getAvailableTeachers(
    @Query('branchId') branchId: string,
    @Query('exactDays') exactDays: string,
    @Query('startTime') startTime: string,
    @Query('endTime') endTime: string,
    @CurrentUser('companyId') companyId: number,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableTeachers({
      branchId: Number(branchId),
      exactDays: days,
      startTime: startTime || '',
      endTime: endTime || '',
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('available-slots')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getAvailableSlots(
    @Query('branchId') branchId: string,
    @Query('roomId') roomId: string,
    @Query('exactDays') exactDays: string,
    @CurrentUser('companyId') companyId: number,
    @Query('excludeGroupId') excludeGroupId?: string,
  ) {
    const days = exactDays ? exactDays.split(',') : [];
    return this.groupScheduleService.getAvailableSlots({
      branchId: Number(branchId),
      roomId,
      exactDays: days,
      excludeGroupId: excludeGroupId || undefined,
      companyId,
    });
  }

  @Get('next-name')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getNextName(
    @Query('branchId') branchId: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.getNextName(Number(branchId), companyId);
  }

  @Get(':id/students')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  findStudentsByGroupId(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.findStudentsByGroupId(id, companyId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.groupsService.findOne(id, companyId, branchScope);
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
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.update(id, dto, userId, companyId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeGroupStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.getStatusHistory(id, companyId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.delete(id, userId, companyId);
  }
}
