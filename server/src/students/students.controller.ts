import { Controller, Get, Post, Patch, Delete, Param, Query, Body, ParseIntPipe, UseGuards } from '@nestjs/common';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('students')
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Get()
  findAll(@Query() query: StudentQueryDto) {
    return this.studentsService.findAll(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.studentsService.findById(id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(@Body() dto: CreateStudentDto, @CurrentUser('companyId') companyId: number) {
    return this.studentsService.create(dto, companyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStudentDto) {
    return this.studentsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.studentsService.delete(id, userId);
  }
}
