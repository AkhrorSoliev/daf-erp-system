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
import { Roles, CurrentUser, BranchScope } from '../common/decorators';
import { RolesGuard } from '../common/guards';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('teachers')
export class TeachersController {
  constructor(
    private teachersService: TeachersService,
    private salaryService: SalaryService,
  ) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  findAll(
    @Query() query: TeacherQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.teachersService.findAll(query, companyId, branchScope);
  }

  @Get(':id/groups')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  findGroupsByTeacherId(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.findGroupsByTeacherId(id, companyId, callerId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.teachersService.findByIdScoped(id, companyId, branchScope);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  create(
    @Body() dto: CreateTeacherDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.create(dto, companyId, callerId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.update(id, dto, companyId, callerId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeTeacherStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.teachersService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/salary-summary')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
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
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  getStatusHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') callerId: number,
  ) {
    return this.teachersService.getStatusHistory(id, companyId, callerId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  delete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.teachersService.delete(id, userId, companyId);
  }
}
