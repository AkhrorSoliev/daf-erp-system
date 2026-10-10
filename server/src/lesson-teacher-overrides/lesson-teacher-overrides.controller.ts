import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { LessonTeacherOverridesService } from './lesson-teacher-overrides.service';
import { UpsertLessonTeacherOverrideDto } from './dto/upsert-lesson-teacher-override.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';

@Controller('lesson-teacher-overrides')
export class LessonTeacherOverridesController {
  constructor(private service: LessonTeacherOverridesService) {}

  // Reads: same scope as LessonCancellation reads — a teacher can list
  // overrides for their own groups, everyone else their own branch's.
  @Get()
  @Can('groups.view')
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
      caller: { userId, roles },
    });
  }

  // Upsert: idempotent per (groupId, date). Writes are admin-only.
  @Put(':groupId/:date')
  @Can('lessons.change')
  upsert(
    @Param('groupId') groupId: string,
    @Param('date') date: string,
    @Body() dto: UpsertLessonTeacherOverrideDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.service.upsert(groupId, date, dto, companyId, userId, roles);
  }

  @Delete(':id')
  @Can('lessons.change-delete')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.service.remove(id, companyId, userId, roles);
  }
}
