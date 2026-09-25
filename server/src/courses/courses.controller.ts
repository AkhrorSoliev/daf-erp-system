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
  ForbiddenException,
} from '@nestjs/common';
import { CoursesService } from './courses.service';
import { CourseQueryDto } from './dto/course-query.dto';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ChangeCourseStatusDto } from './dto/change-course-status.dto';
import {
  CurrentUser,
  Roles,
  STAFF_ROLES,
  BranchScope,
} from '../common/decorators';
import type { ReportBranchIds } from '../common/finance/report-branch-scope';
import { RolesGuard } from '../common/guards';

// `PATCH /courses/:id` is open to Administrator too (ordinary field edits —
// name, price, description), but `paymentModel` is a money decision: it
// moves every group on the course onto different billing rules at once
// (the settings panel and course CREATE already gate it to these two).
// The `@Roles()` guard above can't express "allowed for this endpoint,
// except this one field, for this one role" — so it's checked by hand
// inside `update()` below.
const PAYMENT_MODEL_ROLES = ['CEO', 'Branch Director'];

@Controller('courses')
export class CoursesController {
  constructor(private coursesService: CoursesService) {}

  // Staff only — a student-portal token used to read this too.
  // (course list feeds group forms and price lookups.)
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @Get()
  findAll(
    @Query() query: CourseQueryDto,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.coursesService.findAll(query, companyId, branchScope);
  }

  // Staff only, same reason as the list above.
  @UseGuards(RolesGuard)
  @Roles(...STAFF_ROLES)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @BranchScope() branchScope: ReportBranchIds,
  ) {
    return this.coursesService.findOne(id, companyId, branchScope);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director')
  create(
    @Body() dto: CreateCourseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.coursesService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') callerRoles: string[],
  ) {
    if (
      dto.paymentModel !== undefined &&
      !PAYMENT_MODEL_ROLES.some((r) => callerRoles?.includes(r))
    ) {
      throw new ForbiddenException(
        "Kursning to'lov modelini faqat CEO yoki Filial direktori o'zgartira oladi",
      );
    }
    return this.coursesService.update(id, dto, userId, companyId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeCourseStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.coursesService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.coursesService.getStatusHistory(id, companyId, userId);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.coursesService.delete(id, userId, companyId);
  }
}
