import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { GroupScheduleService } from './group-schedule.service';
import { GroupQueryDto } from './dto/group-query.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { ChangeGroupStatusDto } from './dto/change-group-status.dto';
import { DeleteGroupDto } from './dto/delete-group.dto';
import { CurrentUser, BranchScope, BranchCeiling } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('groups')
export class GroupsController {
  constructor(
    private groupsService: GroupsService,
    private groupScheduleService: GroupScheduleService,
  ) {}

  @Get()
  @Can('groups.view')
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
    return this.groupsService.findAll(
      query,
      currentUser.companyId,
      branchScope,
      // Passed beside the DTO, not inside it: this is the server's own
      // decision about who is asking, and a field on the query object would
      // be one `whitelist` slip away from being client-settable.
      //
      // Not `teacher_id` either — that one means "permanently assigned", and a
      // substitute is not. This also matches the days they were asked to cover.
      isTeacherOnly ? currentUser.id : undefined,
    );
  }

  @Get('schedule-conflicts')
  @Can('groups.manage', 'lessons.change')
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
  @Can('groups.manage', 'lessons.change')
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
  @Can('groups.manage', 'lessons.change')
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
  @Can('groups.manage', 'lessons.change')
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
  @Can('groups.manage')
  getNextName(
    @Query('branchId') branchId: string,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.getNextName(Number(branchId), companyId);
  }

  @Get(':id/students')
  @Can('groups.view')
  findStudentsByGroupId(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.groupsService.findStudentsByGroupId(
      id,
      companyId,
      userId,
      roles,
    );
  }

  @Get(':id')
  @Can('groups.view')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
    @BranchCeiling() ceiling: ReportBranchIds,
  ) {
    return this.groupsService.findOne(id, companyId, branchScope, ceiling);
  }

  @Post()
  @Can('groups.manage')
  create(
    @Body() dto: CreateGroupDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.groupsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('groups.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.update(id, dto, userId, companyId);
  }

  @Patch(':id/status')
  @Can('groups.manage')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeGroupStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @Can('groups.manage')
  getStatusHistory(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.groupsService.getStatusHistory(id, companyId, userId, roles);
  }

  @Get(':id/delete-preview')
  @Can('groups.manage')
  getDeletePreview(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.groupsService.getDeletePreview(id, companyId, userId, roles);
  }

  @Delete(':id')
  @Can('groups.manage')
  delete(
    @Param('id') id: string,
    // Optional. A request with no body still validates: the global
    // ValidationPipe turns a missing body into an empty DTO.
    @Body() dto: DeleteGroupDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.groupsService.delete(id, userId, companyId, dto.reason);
  }
}
