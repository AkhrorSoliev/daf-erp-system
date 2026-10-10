import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { GroupTeacherChangeReasonsService } from './group-teacher-change-reasons.service';
import { CreateGroupTeacherChangeReasonDto } from './dto/create-group-teacher-change-reason.dto';
import { UpdateGroupTeacherChangeReasonDto } from './dto/update-group-teacher-change-reason.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';

@Controller('group-teacher-change-reasons')
export class GroupTeacherChangeReasonsController {
  constructor(
    private readonly reasonsService: GroupTeacherChangeReasonsService,
  ) {}

  @Get()
  @Can('settings.reference', 'students.enroll', 'groups.manage')
  findAll(@CurrentUser('companyId') companyId: number) {
    return this.reasonsService.findAll(companyId);
  }

  @Post()
  @Can('settings.reference')
  create(
    @Body() dto: CreateGroupTeacherChangeReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('settings.reference')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupTeacherChangeReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  @Can('settings.reference')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.remove(id, companyId, userId);
  }
}
