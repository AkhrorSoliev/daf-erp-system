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
import { MockExamSubjectsService } from './mock-exam-subjects.service';
import { CreateMockExamSubjectDto } from './dto/create-mock-exam-subject.dto';
import { UpdateMockExamSubjectDto } from './dto/update-mock-exam-subject.dto';
import { ReorderMockExamSubjectsDto } from './dto/reorder-mock-exam-subjects.dto';
import { CurrentUser, Roles } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller()
@UseGuards(RolesGuard)
@Roles('CEO', 'Branch Director', 'Administrator')
export class MockExamSubjectsController {
  constructor(private readonly subjectsService: MockExamSubjectsService) {}

  @Get('mock-exams/:examId/subjects')
  list(@Param('examId') examId: string) {
    return this.subjectsService.list(examId);
  }

  @Post('mock-exams/:examId/subjects')
  create(
    @Param('examId') examId: string,
    @Body() dto: CreateMockExamSubjectDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.subjectsService.create(examId, dto, companyId, userId);
  }

  @Patch('mock-exams/:examId/subjects/reorder')
  reorder(
    @Param('examId') examId: string,
    @Body() dto: ReorderMockExamSubjectsDto,
  ) {
    return this.subjectsService.reorder(examId, dto);
  }

  @Patch('mock-exam-subjects/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMockExamSubjectDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.subjectsService.update(id, dto, companyId, userId);
  }

  @Delete('mock-exam-subjects/:id')
  remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.subjectsService.remove(id, companyId, userId);
  }
}
