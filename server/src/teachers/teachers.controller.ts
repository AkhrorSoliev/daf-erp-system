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
} from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { SalaryService } from '../salary/salary.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { ChangeTeacherStatusDto } from './dto/change-teacher-status.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('teachers')
export class TeachersController {
  constructor(
    private teachersService: TeachersService,
    private salaryService: SalaryService,
  ) {}

  @Get()
  @Can('teachers.view', 'students.list')
  findAll(
    @Query() query: TeacherQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.teachersService.findAll(query, companyId, branchScope);
  }

  @Get(':id/groups')
  @Can('teachers.view', 'employees.view')
  findGroupsByTeacherId(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.findGroupsByTeacherId(id, companyId, callerId);
  }

  @Get(':id')
  @Can('teachers.view')
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.teachersService.findByIdScoped(id, companyId, branchScope);
  }

  @Post()
  @Can('teachers.manage')
  create(
    @Body() dto: CreateTeacherDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.create(dto, companyId, callerId);
  }

  @Patch(':id')
  @Can('teachers.manage')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.update(id, dto, companyId, callerId);
  }

  @Patch(':id/status')
  @Can('teachers.manage')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeTeacherStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.teachersService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/salary-summary')
  @Can('salary.view')
  async getSalarySummary(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    // The guard lives here rather than in `SalaryService`, which is shared
    // with the payroll surfaces that do their own `resolvePayrollBranchScope`.
    // Adding a second, different confinement inside it would give one method
    // two branch rules.
    await this.teachersService.assertCallerMayTouchTeacher(id, callerId);
    return this.salaryService.getTeacherSalarySummary(id, companyId);
  }

  @Get(':id/status-history')
  @Can('teachers.manage')
  getStatusHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.getStatusHistory(id, companyId, callerId);
  }

  @Delete(':id')
  @Can('teachers.manage')
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.teachersService.delete(id, userId, companyId);
  }
}
