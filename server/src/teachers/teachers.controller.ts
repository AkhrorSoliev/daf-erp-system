import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { SalaryService } from '../salary/salary.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { ChangeTeacherStatusDto } from './dto/change-teacher-status.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('teachers')
export class TeachersController {
  constructor(
    private teachersService: TeachersService,
    private salaryService: SalaryService,
  ) {}

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
  @Roles('CEO', 'Branch Director')
  create(
    @Body() dto: CreateTeacherDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.teachersService.create(dto, companyId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTeacherDto) {
    return this.teachersService.update(id, dto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeTeacherStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.teachersService.changeStatus(id, dto, userId);
  }

  @Get(':id/salary-summary')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  getSalarySummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.salaryService.getTeacherSalarySummary(id, companyId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  getStatusHistory(@Param('id', ParseIntPipe) id: number) {
    return this.teachersService.getStatusHistory(id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.teachersService.delete(id, userId);
  }
}
