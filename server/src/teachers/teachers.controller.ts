import { Controller, Get, Post, Delete, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('teachers')
export class TeachersController {
  constructor(private teachersService: TeachersService) {}

  @Get()
  findAll(@Query() query: TeacherQueryDto) {
    return this.teachersService.findAll(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Administrator')
  create(@Body() dto: CreateTeacherDto) {
    return this.teachersService.create(dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Administrator')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.delete(id);
  }
}
