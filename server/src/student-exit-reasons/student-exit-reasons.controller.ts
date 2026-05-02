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
  UseGuards,
} from '@nestjs/common';
import { ExitType } from '@prisma/client';
import { StudentExitReasonsService } from './student-exit-reasons.service';
import { CreateStudentExitReasonDto } from './dto/create-student-exit-reason.dto';
import { UpdateStudentExitReasonDto } from './dto/update-student-exit-reason.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('student-exit-reasons')
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class StudentExitReasonsController {
  constructor(
    private readonly studentExitReasonsService: StudentExitReasonsService,
  ) {}

  @Get()
  findAll(
    @CurrentUser('companyId') companyId: number,
    @Query('appliesTo', new ParseEnumPipe(ExitType, { optional: true }))
    appliesTo?: ExitType,
  ) {
    return this.studentExitReasonsService.findAll(companyId, appliesTo);
  }

  @Post()
  create(
    @Body() dto: CreateStudentExitReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentExitReasonsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentExitReasonDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentExitReasonsService.update(id, dto, companyId, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentExitReasonsService.remove(id, companyId, userId);
  }
}
