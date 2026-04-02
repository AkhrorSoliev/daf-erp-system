import { Controller, Get, Post, Patch, Delete, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { ChangeTeacherStatusDto } from './dto/change-teacher-status.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('teachers')
export class TeachersController {
  constructor(private teachersService: TeachersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  findAll(@Query() query: TeacherQueryDto) {
    return this.teachersService.findAll(query);
  }

  @Get(':id/groups')
  findGroupsByTeacherId(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.findGroupsByTeacherId(id);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Administrator')
  create(@Body() dto: CreateTeacherDto, @CurrentUser('companyId') companyId: number) {
    return this.teachersService.create(dto, companyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Administrator')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTeacherDto) {
    return this.teachersService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Administrator')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeTeacherStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.teachersService.changeStatus(id, dto, userId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Administrator')
  getStatusHistory(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.getStatusHistory(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Administrator')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.teachersService.delete(id, userId);
  }
}
