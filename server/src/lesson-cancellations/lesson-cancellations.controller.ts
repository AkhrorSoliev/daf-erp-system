import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LessonCancellationsService } from './lesson-cancellations.service';
import { CreateLessonCancellationDto } from './dto/create-lesson-cancellation.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('lesson-cancellations')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
export class LessonCancellationsController {
  constructor(private service: LessonCancellationsService) {}

  // Read: any role that can take attendance can see cancellations for
  // their group(s). Write: CEO / Branch Director / Administrator only.

  // Q5 — groupId is mandatory (the read path is per-group). For Teacher
  // role, the service additionally enforces "this group is yours" so a
  // teacher can't enumerate other groups' cancellations.
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
      // Non-teachers were unconstrained: the teacher branch below kept a
      // teacher inside their own groups, and everyone above them read any
      // branch's cancellations.
      caller: { userId, roles },
    });
  }

  @Post()
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateLessonCancellationDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.service.create(dto, companyId, userId, roles);
  }

  @Delete(':id')
  @Roles('CEO', 'Branch Director')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('roles') roles: string[],
  ) {
    return this.service.remove(id, companyId, userId, roles);
  }
}
