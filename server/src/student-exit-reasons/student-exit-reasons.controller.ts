import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ExitType } from '@prisma/client';
import { StudentExitReasonsService } from './student-exit-reasons.service';
import { CreateStudentExitReasonDto } from './dto/create-student-exit-reason.dto';
import { UpdateStudentExitReasonDto } from './dto/update-student-exit-reason.dto';
import { CurrentUser } from '../common/decorators';
import { Can } from '../common/permissions/access.decorators';

@Controller('student-exit-reasons')
export class StudentExitReasonsController {
  constructor(
    private readonly studentExitReasonsService: StudentExitReasonsService,
  ) {}

  @Get()
  @Can('settings.reference', 'students.enroll', 'groups.manage')
  findAll(
    @CurrentUser('companyId') companyId: number,
    @Query('appliesTo', new ParseEnumPipe(ExitType, { optional: true }))
    appliesTo?: ExitType,
  ) {
    return this.studentExitReasonsService.findAll(companyId, appliesTo);
  }

  @Post()
  @Can('settings.reference')
  create(
    @Body() dto: CreateStudentExitReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentExitReasonsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @Can('settings.reference')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentExitReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentExitReasonsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  @Can('settings.reference')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentExitReasonsService.remove(id, companyId, userId);
  }
}
