import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CourseQueryDto } from './dto/course-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ChangeCourseStatusDto } from './dto/change-course-status.dto';
import { CurrentUser, BranchScope } from '../common/decorators';
import { AnyStaff, Can } from '../common/permissions/access.decorators';
import { PermissionsService } from '../common/permissions/permissions.service';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';

@Controller('courses')
export class CoursesController {
  constructor(
    private coursesService: CoursesService,
    private permissions: PermissionsService,
  ) {}

  // Staff only — a student-portal token used to read this too.
  // (course list feeds group forms and price lookups.)
  @AnyStaff()
  @Get()
  findAll(
    @Query() query: CourseQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.coursesService.findAll(query, companyId, branchScope);
  }

  // Staff only, same reason as the list above.
  @AnyStaff()
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.coursesService.findOne(id, companyId, branchScope);
  }

  @Post()
  @Can('courses.create')
  create(
    @Body() dto: CreateCourseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.coursesService.create(dto, companyId, userId);
  }

  // `PATCH /courses/:id` takes `settings.reference` (ordinary field edits —
  // name, price, description), but `paymentModel` is a money decision: it
  // moves every group on the course onto different billing rules at once, and
  // course CREATE already gates it with `courses.create`. The route marker
  // can't express "allowed for this endpoint, except this one field" — so
  // that field is checked by hand below.
  @Patch(':id')
  @Can('settings.reference')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    if (
      dto.paymentModel !== undefined &&
      !(await this.permissions.has(userId, 'courses.create'))
    ) {
      throw new ForbiddenException(
        "Kursning to'lov modelini faqat CEO yoki Filial direktori o'zgartira oladi",
      );
    }
    return this.coursesService.update(id, dto, userId, companyId);
  }

  @Patch(':id/status')
  @Can('settings.reference')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeCourseStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.coursesService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @Can('settings.reference')
  getStatusHistory(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.coursesService.getStatusHistory(id, companyId, userId);
  }

  @Delete(':id')
  @Can('settings.reference')
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.coursesService.delete(id, userId, companyId);
  }
}
