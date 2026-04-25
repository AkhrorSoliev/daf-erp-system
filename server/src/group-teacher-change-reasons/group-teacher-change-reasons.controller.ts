import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GroupTeacherChangeReasonsService } from './group-teacher-change-reasons.service';
import { CreateGroupTeacherChangeReasonDto } from './dto/create-group-teacher-change-reason.dto';
import { UpdateGroupTeacherChangeReasonDto } from './dto/update-group-teacher-change-reason.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('group-teacher-change-reasons')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class GroupTeacherChangeReasonsController {
  constructor(
    private readonly reasonsService: GroupTeacherChangeReasonsService,
  ) {}

  @Get()
  findAll(@CurrentUser('companyId') companyId: number) {
    return this.reasonsService.findAll(companyId);
  }

  @Post()
  create(
    @Body() dto: CreateGroupTeacherChangeReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupTeacherChangeReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.reasonsService.remove(id, companyId, userId);
  }
}
