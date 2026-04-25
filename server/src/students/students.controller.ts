import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { StudentEnrollmentService } from './student-enrollment.service';
import { SmsService } from '../sms/sms.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto';
import { RemoveFromGroupDto } from './dto/remove-from-group.dto';
import { EnrollToGroupDto } from './dto/enroll-to-group.dto';
import { DeleteStudentDto } from './dto/delete-student.dto';
import { SendSmsDto } from '../sms/dto/send-sms.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Roles, CurrentUser } from '../common/decorators';
import { RolesGuard } from '../common/guards';

@Controller('students')
export class StudentsController {
  constructor(
    private studentsService: StudentsService,
    private studentEnrollmentService: StudentEnrollmentService,
    private smsService: SmsService,
  ) {}

  @Get()
  findAll(@Query() query: StudentQueryDto, @CurrentUser() currentUser: any) {
    const roles: string[] = currentUser.roles ?? [];
    const isTeacherOnly =
      roles.includes('Teacher') &&
      !roles.some((r) =>
        ['CEO', 'Branch Director', 'Administrator'].includes(r),
      );
    if (isTeacherOnly) {
      query.teacher_id = currentUser.id;
    }
    return this.studentsService.findAll(query, currentUser.companyId);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator', 'Cashier')
  findById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.findById(id, companyId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  create(
    @Body() dto: CreateStudentDto,
    @CurrentUser('companyId') companyId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.studentsService.create(dto, companyId, userId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.update(id, dto, userId, companyId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  changeStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChangeStudentStatusDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.changeStatus(id, dto, userId, companyId);
  }

  @Get(':id/status-history')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getStatusHistory(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.getStatusHistory(id, companyId);
  }

  @Post(':id/enroll')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  enrollToGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnrollToGroupDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentEnrollmentService.enrollToGroup(
      id,
      dto.groupId,
      userId,
      companyId,
      { transferReasonId: dto.transferReasonId },
    );
  }

  @Delete(':id/enroll/:enrollmentId')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  removeFromGroup(
    @Param('id', ParseIntPipe) id: number,
    @Param('enrollmentId') enrollmentId: string,
    @Body() dto: RemoveFromGroupDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentEnrollmentService.removeFromGroup(
      id,
      enrollmentId,
      userId,
      companyId,
      dto,
    );
  }

  @Get(':id/sms')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  getSmsHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: PaginationDto,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.smsService.getByStudent(
      id,
      companyId,
      query.page,
      query.pageSize,
    );
  }

  @Post(':id/sms')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  sendSms(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendSmsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.smsService.sendToStudent(
      id,
      dto.content,
      'MANUAL',
      userId,
      companyId,
    );
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('CEO', 'Branch Director', 'Administrator')
  delete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DeleteStudentDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('companyId') companyId: number,
  ) {
    return this.studentsService.delete(id, userId, dto.reason, companyId);
  }
}
