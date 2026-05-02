import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LessonTeacherOverridesService } from './lesson-teacher-overrides.service';
import { UpsertLessonTeacherOverrideDto } from './dto/upsert-lesson-teacher-override.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('lesson-teacher-overrides')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
export class LessonTeacherOverridesController {
  constructor(private service: LessonTeacherOverridesService) {}

  // Reads: same scope as LessonCancellation reads — a teacher can list
  // overrides for their own groups; admins see everything.
  @Get()
  list(
    @Query('groupId') groupId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    if (!groupId) {
      throw new BadRequestException('groupId majburiy');
    }
    const isTeacherOnly =
      Array.isArray(roles) &&
      roles.length > 0 &&
      roles.every((r) => r === 'Teacher');
    return this.service.findByGroup(groupId, companyId, {
      from,
      to,
      teacherIdScope: isTeacherOnly ? userId : undefined,
    });
  }

  // Upsert: idempotent per (groupId, date). Writes are admin-only.
  @Put(':groupId/:date')
  @Roles('CEO', 'Branch Director', 'Administrator')
  upsert(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: UpsertLessonTeacherOverrideDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.service.upsert(groupId, date, dto, companyId, userId);
  }

  @Delete(':id')
  @Roles('CEO', 'Branch Director')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.service.remove(id, companyId, userId);
  }
}
