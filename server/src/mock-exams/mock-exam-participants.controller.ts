import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MockExamParticipantsService } from './mock-exam-participants.service';
import { AddManualParticipantDto } from './dto/add-manual-participant.dto';
import { ConvertMockParticipantDto } from './dto/convert-mock-participant.dto';
import { ParticipantsQueryDto } from './dto/participants-query.dto';
import { MarkMockPaidDto } from './dto/mark-mock-paid.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller()
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class MockExamParticipantsController {
  constructor(
    private readonly participantsService: MockExamParticipantsService,
  ) {}

  @Get('mock-exams/:examId/participants')
  list(
    @Param('examId') examId: string,
    @Query() query: ParticipantsQueryDto,
  ) {
    return this.participantsService.list(examId, query);
  }

  /** Mock exams a student has participated in — for /students/profile/[id] */
  @Get('students/:studentId/mock-exams')
  listForStudent(@Param('studentId') studentId: string) {
    return this.participantsService.listForStudent(Number(studentId));
  }

  @Post('mock-exams/:examId/participants/manual')
  addManual(
    @Param('examId') examId: string,
    @Body() dto: AddManualParticipantDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.participantsService.addManual(examId, dto, companyId, userId);
  }

  @Post('mock-exam-participants/:id/mark-paid')
  markPaid(
    @Param('id') id: string,
    @Body() dto: MarkMockPaidDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.participantsService.markPaid(id, dto, companyId, userId);
  }

  @Post('mock-exam-participants/:id/convert')
  convertToStudent(
    @Param('id') id: string,
    @Body() dto: ConvertMockParticipantDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.participantsService.convertToStudent(id, dto, companyId, userId);
  }

  @Delete('mock-exam-participants/:id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.participantsService.remove(id, companyId, userId);
  }
}
