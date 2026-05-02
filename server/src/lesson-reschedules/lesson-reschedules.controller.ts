import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LessonReschedulesService } from './lesson-reschedules.service';
import { CreateLessonRescheduleDto } from './dto/create-lesson-reschedule.dto';
import { UpdateLessonRescheduleDto } from './dto/update-lesson-reschedule.dto';
import { AvailableRoomsQueryDto } from './dto/available-rooms-query.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('lesson-reschedules')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator', 'Teacher')
export class LessonReschedulesController {
  constructor(private service: LessonReschedulesService) {}

  @Get()
  list(
    @Query('groupId') groupId: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @CurrentUser('id') userId: number,
    @CurrentUser('roles') roles: string[],
    @CurrentUser('companyId') companyId: number,
  ) {
    if (!groupId) throw new BadRequestException('groupId majburiy');
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

  @Get('available-rooms')
  @Roles('CEO', 'Branch Director', 'Administrator')
  availableRooms(
    @Query() query: AvailableRoomsQueryDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.service.findAvailableRooms(query, companyId);
  }

  @Post()
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateLessonRescheduleDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.service.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLessonRescheduleDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.service.update(id, dto, companyId, userId);
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
